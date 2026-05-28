import * as cheerio from "cheerio";

import { isLikelyImageUrl, normalizeUrl } from "@/lib/image-collector/url";

type SrcsetCandidate = {
  score: number;
  url: string;
};

function parseSrcset(srcset: string) {
  const candidates: SrcsetCandidate[] = [];

  for (const chunk of srcset.split(",")) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean);
    const url = parts[0];

    if (!url) {
      continue;
    }

    const descriptor = parts[1] ?? "";
    const widthMatch = descriptor.match(/^(\d+)w$/i);
    const densityMatch = descriptor.match(/^([\d.]+)x$/i);
    const score = widthMatch
      ? Number(widthMatch[1])
      : densityMatch
        ? Number(densityMatch[1]) * 1000
        : candidates.length + 1;

    candidates.push({
      score: Number.isFinite(score) ? score : 0,
      url,
    });
  }

  return candidates.sort((a, b) => b.score - a.score).map((candidate) => candidate.url);
}

function pushUrl(urls: Set<string>, baseUrl: string, value: string | undefined) {
  if (!value) {
    return;
  }

  const normalized = normalizeUrl(baseUrl, value);

  if (normalized && isLikelyImageUrl(normalized)) {
    urls.add(normalized);
  }
}

function pushSrcset(urls: Set<string>, baseUrl: string, value: string | undefined) {
  if (!value) {
    return;
  }

  const [bestUrl] = parseSrcset(value);
  pushUrl(urls, baseUrl, bestUrl);
}

export function extractImageUrlsFromHtml(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $("img").each((_, element) => {
    const image = $(element);
    pushUrl(urls, pageUrl, image.attr("src"));
    pushUrl(urls, pageUrl, image.attr("data-src"));
    pushUrl(urls, pageUrl, image.attr("data-original"));
    pushUrl(urls, pageUrl, image.attr("data-lazy-src"));
    pushSrcset(urls, pageUrl, image.attr("srcset"));
    pushSrcset(urls, pageUrl, image.attr("data-srcset"));
  });

  $("source").each((_, element) => {
    const source = $(element);
    pushSrcset(urls, pageUrl, source.attr("srcset"));
    pushSrcset(urls, pageUrl, source.attr("data-srcset"));
  });

  return Array.from(urls);
}
