export function getDisplayImageSrc(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.pathname.startsWith("/uploads/assets/") || parsed.pathname.startsWith("/uploads/collector/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Relative URLs can be passed through unchanged.
  }

  return url;
}
