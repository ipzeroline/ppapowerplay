import crypto from "node:crypto";

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split(":");
  if (scheme !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(hash || "")) return false;
  const candidate = await scrypt(password, salt);
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

function scrypt(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey.toString("hex"));
    });
  });
}
