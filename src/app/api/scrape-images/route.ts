import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;
const MIN_SIZE = 200;

function isValidImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveUrl(src: string, baseUrl: string): string | null {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: { url?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无法解析请求体" }, { status: 400 });
  }

  const pageUrl = body.url?.trim();
  if (!pageUrl || !isValidImageUrl(pageUrl)) {
    return NextResponse.json({ error: "请输入有效的网页 URL" }, { status: 400 });
  }

  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `页面请求失败：${res.status} ${res.statusText}` },
        { status: 422 },
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const imageSet = new Set<string>();

    // Extract from <img> tags
    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-original");
      if (!src) return;
      const resolved = resolveUrl(src, pageUrl);
      if (resolved) imageSet.add(resolved);

      // srcset
      const srcset = $(el).attr("srcset") || $(el).attr("data-srcset");
      if (srcset) {
        srcset.split(",").forEach((entry) => {
          const parts = entry.trim().split(/\s+/);
          if (parts[0]) {
            const r = resolveUrl(parts[0], pageUrl);
            if (r) imageSet.add(r);
          }
        });
      }
    });

    // Extract from <meta og:image>
    $('meta[property="og:image"], meta[name="og:image"]').each((_, el) => {
      const content = $(el).attr("content");
      if (content) {
        const r = resolveUrl(content, pageUrl);
        if (r) imageSet.add(r);
      }
    });

    // Extract from <a> linking to images
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href && IMAGE_EXTENSIONS.test(href)) {
        const r = resolveUrl(href, pageUrl);
        if (r) imageSet.add(r);
      }
    });

    // Extract from background-image in style attributes
    $("[style]").each((_, el) => {
      const style = $(el).attr("style") || "";
      const match = style.match(/url\(['"]?(.*?)['"]?\)/);
      if (match?.[1]) {
        const r = resolveUrl(match[1], pageUrl);
        if (r) imageSet.add(r);
      }
    });

    // Filter: only keep likely product images (skip tiny icons, tracking pixels)
    const images = Array.from(imageSet).filter((url) => {
      // Skip data URIs and SVGs
      if (url.startsWith("data:") || url.endsWith(".svg")) return false;
      // Skip common tracking/icon patterns
      if (/pixel|tracker|spacer|icon|logo|badge|sprite/i.test(url)) return false;
      return true;
    });

    return NextResponse.json({ images, count: images.length, source_url: pageUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "抓取失败";
    return NextResponse.json({ error: `页面抓取失败：${msg}` }, { status: 500 });
  }
}
