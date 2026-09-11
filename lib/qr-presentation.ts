export function qrErrorKey(status: number | undefined, purpose: string) {
  if (status === 401) return "qr.error.session";
  if (status === 403) return "qr.error.forbidden";
  if (status === 404) return purpose === "member" ? "qr.error.membership" : "qr.error.rights";
  if (status === 429) return "qr.error.rate";
  return "qr.error.service";
}
