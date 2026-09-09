import { createHash, randomBytes } from "node:crypto";

export function createQrToken() {
  return randomBytes(32).toString("base64url");
}

export function hashQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
