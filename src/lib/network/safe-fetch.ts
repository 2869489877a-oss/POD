import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

const PRIVATE_IPV4_RANGES = [
  { start: ipToNumber("10.0.0.0"), end: ipToNumber("10.255.255.255") },
  { start: ipToNumber("127.0.0.0"), end: ipToNumber("127.255.255.255") },
  { start: ipToNumber("169.254.0.0"), end: ipToNumber("169.254.255.255") },
  { start: ipToNumber("172.16.0.0"), end: ipToNumber("172.31.255.255") },
  { start: ipToNumber("192.168.0.0"), end: ipToNumber("192.168.255.255") },
  { start: ipToNumber("0.0.0.0"), end: ipToNumber("0.255.255.255") },
];

type SafeFetchBufferOptions = {
  allowedContentTypes?: string[];
  headers?: HeadersInit;
  maxBytes?: number;
  timeoutMs?: number;
};

type SafeFetchBinaryResult = {
  buffer: Buffer;
  contentType: string | null;
};

function ipToNumber(ip: string) {
  return ip.split(".").reduce((acc, part) => (acc * 256) + Number(part), 0);
}

function isPrivateIpv4(hostname: string) {
  if (isIP(hostname) !== 4) return false;
  const value = ipToNumber(hostname);
  return PRIVATE_IPV4_RANGES.some((range) => value >= range.start && value <= range.end);
}

function isPrivateIpv6(hostname: string) {
  if (isIP(hostname) !== 6) return false;
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  );
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata.google.internal" ||
    normalized === "metadata" ||
    normalized.endsWith(".internal") ||
    isPrivateIpv4(normalized) ||
    isPrivateIpv6(normalized)
  );
}

async function assertPublicResolvedAddress(hostname: string) {
  if (isIP(hostname)) return;
  const addresses = await lookup(hostname, { all: true, verbatim: false });
  if (addresses.some((item) => isBlockedHostname(item.address))) {
    throw new Error(`目标域名解析到内网或本机地址：${hostname}`);
  }
}

async function safeFetchResponse(parsed: URL, options: SafeFetchBufferOptions, redirectsLeft = 5): Promise<Response> {
  await assertPublicResolvedAddress(parsed.hostname);

  const response = await fetch(parsed, {
    headers: options.headers,
    redirect: "manual",
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) return response;
    if (redirectsLeft <= 0) {
      throw new Error("重定向次数过多");
    }
    const nextUrl = parseSafeHttpUrl(new URL(location, parsed).href);
    return safeFetchResponse(nextUrl, options, redirectsLeft - 1);
  }

  return response;
}

function parseSafeHttpUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL 无效：${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`只允许 http/https URL：${url}`);
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`不允许访问内网或本机地址：${parsed.hostname}`);
  }

  return parsed;
}

function assertAllowedContentType(contentType: string | null, allowedContentTypes?: string[]) {
  if (!allowedContentTypes?.length) return;
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase() || "";
  if (!normalized || !allowedContentTypes.some((prefix) => normalized.startsWith(prefix.toLowerCase()))) {
    throw new Error(`响应类型不允许：${contentType ?? "unknown"}`);
  }
}

export async function safeFetchBinary(url: string, options: SafeFetchBufferOptions = {}): Promise<SafeFetchBinaryResult> {
  const parsed = parseSafeHttpUrl(url);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const response = await safeFetchResponse(parsed, options);

  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  assertAllowedContentType(contentType, options.allowedContentTypes);

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`下载内容超过 ${Math.round(maxBytes / 1024 / 1024)}MB`);
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error(`下载内容超过 ${Math.round(maxBytes / 1024 / 1024)}MB`);
    }
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let downloadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    downloadedBytes += value.byteLength;
    if (downloadedBytes > maxBytes) {
      throw new Error(`下载内容超过 ${Math.round(maxBytes / 1024 / 1024)}MB`);
    }
    chunks.push(Buffer.from(value));
  }

  return { buffer: Buffer.concat(chunks), contentType };
}

export async function safeFetchBuffer(url: string, options: SafeFetchBufferOptions = {}) {
  return (await safeFetchBinary(url, options)).buffer;
}

export async function safeFetchText(url: string, options: SafeFetchBufferOptions = {}) {
  const buffer = await safeFetchBuffer(url, {
    ...options,
    allowedContentTypes: options.allowedContentTypes ?? ["text/html", "application/xhtml+xml", "application/xml", "text/plain"],
  });
  return buffer.toString("utf8");
}

export function assertSafeHttpUrl(url: string) {
  return parseSafeHttpUrl(url).href;
}
