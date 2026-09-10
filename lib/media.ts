export function safeImageSource(value: string | null | undefined): string | null {
  if (!value || value !== value.trim() || /[\\\u0000-\u001f]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
