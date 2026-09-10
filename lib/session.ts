import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const developmentSecret = randomBytes(32).toString("hex");

function secret() {
  const value = process.env.SESSION_SECRET || process.env.ADMIN_ACCESS_KEY;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") throw new Error("A session secret of at least 32 characters is required");
  return developmentSecret;
}

export function signSession(purpose: string, subject: string, maxAgeSeconds: number) {
  const payload = Buffer.from(JSON.stringify({ subject, expiresAt: Date.now() + maxAgeSeconds * 1000 })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(`${purpose}:${payload}`).digest("hex");
  return `${payload}.${signature}`;
}

export function readSession(purpose: string, value: string): string | null {
  if (!value || value.length > 4096) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
  const expected = createHmac("sha256", secret()).update(`${purpose}:${parts[0]}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(parts[1], "hex"))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return typeof payload.subject === "string" && Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now() ? payload.subject : null;
  } catch {
    return null;
  }
}
