import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Transfer slips are financial records: kept outside public/, read only by staff routes.
export const SLIP_MAX_BYTES = 5 * 1024 * 1024;
const contentTypes = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
type SlipType = keyof typeof contentTypes;
const storedName = /^PAY[A-Z0-9]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

// Runtime-only paths: turbopackIgnore keeps the build from tracing the whole project into the server output.
export function slipStorageDir() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.SLIP_STORAGE_DIR || path.join(process.cwd(), "storage", "payment-slips"));
}

export function detectImageType(bytes: Buffer): SlipType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export async function saveSlip(paymentNo: string, bytes: Buffer, type: SlipType) {
  const name = `${paymentNo}-${randomUUID()}.${type}`;
  const dir = slipStorageDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes, { mode: 0o600 });
  return name;
}

export async function readSlip(name: string) {
  if (!storedName.test(name)) throw new Error("Invalid slip name");
  const bytes = await readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ slipStorageDir(), name));
  return { bytes, contentType: contentTypes[name.split(".").pop() as SlipType] };
}

export async function removeSlip(name: string | null | undefined) {
  if (name && storedName.test(name)) await unlink(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ slipStorageDir(), name)).catch(() => {});
}
