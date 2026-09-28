/** Metadata URLs only; never accept executable schemes, credentials or local hosts. */
export function tokenImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|0\.|\[|10\.|192\.168\.)/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
