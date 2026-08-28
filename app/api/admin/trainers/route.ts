import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";

const trainerSchema = z.object({
  id: z.number().optional(),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(160),
  nickname: z.string().min(1).max(80),
  role: z.string().min(2).max(120),
  avatar: z.string().min(1).max(16).default("🏋️"),
  imageUrl: z.string().max(600).optional().or(z.literal("")),
  experience: z.string().min(1).max(40),
  zodiac: z.string().max(40).optional().or(z.literal("")),
  birthYear: z.number().int().min(2400).max(2700).optional().nullable(),
  bloodType: z.string().max(8).optional().or(z.literal("")),
  contactPhone: z.string().max(32).optional().or(z.literal("")),
  certifications: z.array(z.string().min(1).max(160)).default([]),
  startPrice: z.number().min(0).max(999999),
  active: z.boolean(),
});

export async function GET(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const trainers = await loadTrainers();
  return NextResponse.json({ trainers });
}

export async function POST(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const body = trainerSchema.parse(await request.json());
  await query(
    "INSERT INTO trainers (slug, name, nickname, role, avatar, image_url, experience, zodiac, birth_year, blood_type, contact_phone, start_price, certifications, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      body.slug,
      body.name,
      body.nickname,
      body.role,
      body.avatar,
      body.imageUrl || null,
      body.experience,
      body.zodiac || null,
      body.birthYear || null,
      body.bloodType || null,
      body.contactPhone || null,
      body.startPrice,
      JSON.stringify(body.certifications),
      body.active,
    ],
  );
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('trainer.create', 'trainers', ?, JSON_OBJECT('slug', ?, 'name', ?))", [
    body.slug,
    body.slug,
    body.name,
  ]);
  return GET(request);
}

export async function PUT(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const body = trainerSchema.extend({ id: z.number().positive() }).parse(await request.json());
  await query(
    "UPDATE trainers SET slug = ?, name = ?, nickname = ?, role = ?, avatar = ?, image_url = ?, experience = ?, zodiac = ?, birth_year = ?, blood_type = ?, contact_phone = ?, start_price = ?, certifications = ?, active = ? WHERE id = ?",
    [
      body.slug,
      body.name,
      body.nickname,
      body.role,
      body.avatar,
      body.imageUrl || null,
      body.experience,
      body.zodiac || null,
      body.birthYear || null,
      body.bloodType || null,
      body.contactPhone || null,
      body.startPrice,
      JSON.stringify(body.certifications),
      body.active,
      body.id,
    ],
  );
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('trainer.update', 'trainers', ?, JSON_OBJECT('slug', ?, 'name', ?))", [
    String(body.id),
    body.slug,
    body.name,
  ]);
  return GET(request);
}

export async function DELETE(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ message: "Missing trainer id" }, { status: 400 });

  await query("DELETE FROM trainers WHERE id = ?", [id]);
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id) VALUES ('trainer.delete', 'trainers', ?)", [String(id)]);
  return GET(request);
}

function loadTrainers() {
  return query(
    "SELECT id, slug, name, nickname, role, avatar, image_url imageUrl, experience, zodiac, birth_year birthYear, blood_type bloodType, contact_phone contactPhone, start_price startPrice, CAST(certifications AS CHAR) certifications, active FROM trainers ORDER BY id DESC LIMIT 120",
  );
}
