export type ProviderFailureKind =
  | "forbidden"
  | "invalid_key"
  | "invalid_request"
  | "network"
  | "quota_exhausted"
  | "rate_limited"
  | "server_error"
  | "unknown"
  | "unsupported";

export type ProviderFailure = {
  affectsProvider: boolean;
  code?: string;
  kind: ProviderFailureKind;
  message: string;
  retryable: boolean;
  status?: number;
};

export class ImageProviderError extends Error {
  affectsProvider: boolean;
  code?: string;
  kind: ProviderFailureKind;
  retryable: boolean;
  status?: number;

  constructor(message: string, failure: Omit<ProviderFailure, "message">) {
    super(message);
    this.name = "ImageProviderError";
    this.affectsProvider = failure.affectsProvider;
    this.code = failure.code;
    this.kind = failure.kind;
    this.retryable = failure.retryable;
    this.status = failure.status;
  }
}

export function makeProviderError(
  providerName: string,
  status: number,
  rawBody: string,
  fallbackStatusText = "request failed",
) {
  const parsed = parseErrorPayload(rawBody);
  const message = parsed.message || rawBody || fallbackStatusText;
  const code = parsed.code;
  const kind = classifyProviderFailure(status, code, message);

  return new ImageProviderError(
    `${providerName} API error ${status}: ${message}`,
    {
      affectsProvider: kind !== "invalid_request",
      code,
      kind,
      retryable: kind === "network" || kind === "rate_limited" || kind === "server_error",
      status,
    },
  );
}

export function unsupportedProviderError(message: string) {
  return new ImageProviderError(message, {
    affectsProvider: false,
    kind: "unsupported",
    retryable: false,
  });
}

export function normalizeProviderError(error: unknown): ImageProviderError {
  if (error instanceof ImageProviderError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/\b(?:API error|failed)\s+(\d{3})\b/i);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;

  if (status) {
    const kind = classifyProviderFailure(status, undefined, message);
    return new ImageProviderError(message, {
      affectsProvider: kind !== "invalid_request",
      kind,
      retryable: kind === "network" || kind === "rate_limited" || kind === "server_error",
      status,
    });
  }

  if (/fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR|socket|connection|AbortError|TimeoutError/i.test(message)) {
    return new ImageProviderError(message, {
      affectsProvider: true,
      kind: "network",
      retryable: true,
    });
  }

  return new ImageProviderError(message, {
    affectsProvider: false,
    kind: "unknown",
    retryable: false,
  });
}

function parseErrorPayload(text: string): { code?: string; message?: string } {
  if (!text.trim()) return {};

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const nestedError = typeof payload.error === "object" && payload.error
      ? payload.error as Record<string, unknown>
      : undefined;
    const code = stringValue(payload.code) || stringValue(nestedError?.code);
    const message = stringValue(payload.message)
      || stringValue(nestedError?.message)
      || stringValue(payload.error)
      || text;

    return { code, message };
  } catch {
    return { message: text };
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function classifyProviderFailure(status: number, code: string | undefined, message: string): ProviderFailureKind {
  const text = `${code ?? ""} ${message}`.toLowerCase();

  if (/allocationquota\.freetieronly|quota|insufficient.*balance|balance.*insufficient|no enough|out of.*credit|out of.*balance|余额不足|额度不足|额度已用完|免费额度|欠费|arrears|billing/i.test(text)) {
    return "quota_exhausted";
  }

  if (/invalid.*api.*key|apikey.*invalid|api key.*invalid|invalid token|unauthorized|authentication|鉴权|认证失败|无效.*key/i.test(text)) {
    return "invalid_key";
  }

  if (/rate.?limit|too many requests|qps|tpm|rpm|限流|请求过多/i.test(text)) {
    return "rate_limited";
  }

  if (status === 401) return "invalid_key";
  if (status === 403) return "forbidden";
  if (status === 408) return "network";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status >= 400) return "invalid_request";

  return "unknown";
}
