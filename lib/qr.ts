import { createHash, randomBytes } from "node:crypto";

export function createQrToken() {
  return randomBytes(32).toString("base64url");
}

export function hashQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// A USB or Bluetooth QR scanner types like a keyboard. With the PC keyboard set to Thai (Kedmanee)
// every key arrives as its Thai character, so the text is turned back into the keys that were pressed.
const qwerty = { plain: "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./", shift: "~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:\"ZXCVBNM<>?" };
const kedmanee = { plain: "_ๅ/-ภถุึคตจขชๆไำพะัีรนยบลฃฟหกดเ้่าสวงผปแอิืทมใฝ", shift: "%+๑๒๓๔ู฿๕๖๗๘๙๐\"ฎฑธํ๊ณฯญฐ,ฅฤฆฏโฌ็๋ษศซ.()ฉฮฺ์?ฒฬฦ" };
const fromThaiLayout = new Map<string, string>();
for (const layer of ["plain", "shift"] as const) {
  [...kedmanee[layer]].forEach((character, index) => fromThaiLayout.set(character, qwerty[layer][index]));
}

function thaiKeyboardToQwerty(text: string) {
  return /[฀-๿]/.test(text) ? [...text].map((character) => fromThaiLayout.get(character) ?? character).join("") : text;
}

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function isQrToken(value: string) {
  return tokenPattern.test(value);
}

// The token from what a scanner read: the short QR address (/q/<token>), an address with ?token=
// (the staff scanner, or codes issued before /q/), or the bare token.
export function extractQrToken(value: string) {
  const text = thaiKeyboardToQwerty(value.trim());
  try {
    const url = new URL(text);
    const token = /^\/q\/([^/]+)$/.exec(url.pathname)?.[1] || url.searchParams.get("token") || "";
    return tokenPattern.test(token) ? token : "";
  } catch {
    return tokenPattern.test(text) ? text : "";
  }
}
