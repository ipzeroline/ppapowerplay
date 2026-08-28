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

  const extension = allowedTypes.get(file.type);
  const filename = `${Date.now()}-${randomUUID()}.${extension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "trainers");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ imageUrl: `/uploads/trainers/${filename}` });
}
