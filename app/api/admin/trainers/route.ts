import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { parseJsonBody, validationErrorResponse } from "@/lib/security";

const cleanText = (max: number) => z.string().trim().max(max);
const trainerPackageSchema = z.object({
  title: cleanText(80).min(1),
  text: cleanText(160).min(1),
  price: z.coerce.number().min(0).max(999999),
});
const trainerSlotSchema = z.object({
  time: z.string().trim().regex(/^\d{2}:\d{2}$/),
  status: z.enum(["available", "full", "off"]).default("available"),
});
const trainerScheduleSchema = z.object({
  day: cleanText(40).min(1),
  date: cleanText(16).optional().or(z.literal("")),
  slots: z.array(trainerSlotSchema).max(12).default([]),
});

const trainerSchema = z.object({
  id: z.coerce.number().optional(),
  slug: z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: cleanText(160).min(2),
  nickname: cleanText(80).min(1),
  role: cleanText(120).min(2),
  avatar: cleanText(16).min(1).default("🏋️"),
  imageUrl: cleanText(600).optional().or(z.literal("")),
  experience: cleanText(40).min(1),
  zodiac: cleanText(40).optional().or(z.literal("")),
  birthYear: z.coerce.number().int().min(2400).max(2700).optional().nullable(),
  bloodType: cleanText(8).optional().or(z.literal("")),
  contactPhone: cleanText(32).optional().or(z.literal("")),
  bio: cleanText(1200).optional().or(z.literal("")),
  socialLine: cleanText(120).optional().or(z.literal("")),
  specialties: z.array(cleanText(80).min(1)).max(12).default([]),
  packages: z.array(trainerPackageSchema).max(12).default([]),
  weeklySchedule: z.array(trainerScheduleSchema).max(14).default([]),
  certifications: z.array(cleanText(160).min(1)).max(24).default([]),
  startPrice: z.coerce.number().min(0).max(999999),
  sortOrder: z.coerce.number().int().min(0).max(999999).default(0),
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

  let body: z.infer<typeof trainerSchema>;
  try {
    body = await parseJsonBody(request, trainerSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  try {
    await query(
      "INSERT INTO trainers (slug, name, nickname, role, avatar, image_url, experience, zodiac, birth_year, blood_type, contact_phone, bio, specialties, packages, weekly_schedule, social_line, start_price, certifications, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      trainerParams(body),
    );
  } catch (error) {
    if (isDuplicateSlug(error)) return NextResponse.json({ message: "Slug นี้ถูกใช้งานแล้ว" }, { status: 409 });
    throw error;
  }
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

  let body: z.infer<typeof trainerSchema> & { id: number };
  try {
    body = await parseJsonBody(request, trainerSchema.extend({ id: z.number().positive() }));
  } catch (error) {
    return validationErrorResponse(error);
  }
  try {
    await query(
      "UPDATE trainers SET slug = ?, name = ?, nickname = ?, role = ?, avatar = ?, image_url = ?, experience = ?, zodiac = ?, birth_year = ?, blood_type = ?, contact_phone = ?, bio = ?, specialties = ?, packages = ?, weekly_schedule = ?, social_line = ?, start_price = ?, certifications = ?, active = ?, sort_order = ? WHERE id = ?",
      [...trainerParams(body), body.id],
    );
  } catch (error) {
    if (isDuplicateSlug(error)) return NextResponse.json({ message: "Slug นี้ถูกใช้งานแล้ว" }, { status: 409 });
    throw error;
  }
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

  await query("UPDATE trainers SET active = FALSE WHERE id = ?", [id]);
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id) VALUES ('trainer.delete', 'trainers', ?)", [String(id)]);
  return GET(request);
}

function loadTrainers() {
  return query(
    "SELECT id, slug, name, nickname, role, avatar, image_url imageUrl, experience, zodiac, birth_year birthYear, blood_type bloodType, contact_phone contactPhone, bio, CAST(specialties AS CHAR) specialties, CAST(packages AS CHAR) packages, CAST(weekly_schedule AS CHAR) weeklySchedule, social_line socialLine, start_price startPrice, CAST(certifications AS CHAR) certifications, active, sort_order sortOrder FROM trainers ORDER BY active DESC, sort_order, id DESC LIMIT 120",
  );
}

function trainerParams(body: z.infer<typeof trainerSchema>) {
  return [
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
    body.bio || null,
    JSON.stringify(body.specialties),
    JSON.stringify(body.packages),
    JSON.stringify(body.weeklySchedule),
    body.socialLine || null,
    body.startPrice,
    JSON.stringify(body.certifications),
    body.active,
    body.sortOrder,
  ];
}

function isDuplicateSlug(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY";
}
