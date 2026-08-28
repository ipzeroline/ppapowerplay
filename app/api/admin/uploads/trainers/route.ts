import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-auth";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maxBytes = 3 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Missing file" }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ message: "Only JPG, PNG, or WEBP images are allowed" }, { status: 415 });
  if (file.size > maxBytes) return NextResponse.json({ message: "Image must be 3MB or smaller" }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isAllowedImage(bytes, file.type)) {
    return NextResponse.json({ message: "Invalid image file" }, { status: 415 });
  }

  const extension = allowedTypes.get(file.type);
  const filename = `${Date.now()}-${randomUUID()}.${extension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "trainers");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), bytes);

  return NextResponse.json({ imageUrl: `/uploads/trainers/${filename}` });
}

function isAllowedImage(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (mimeType === "image/webp") {
    return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}
