import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { parseJsonBody, validationErrorResponse } from "@/lib/security";

const cleanText = (max: number) => z.string().trim().max(max);
const metadataSchema = z.record(z.string(), z.unknown()).default({});
const contentSchema = z.object({
  id: z.coerce.number().optional(),
  contentType: z.string().trim().toLowerCase().min(2).max(64).regex(/^[a-z0-9_-]+$/),
  slug: z.string().trim().toLowerCase().min(2).max(96).regex(/^[a-z0-9-]+$/),
  title: cleanText(180).min(2),
  subtitle: cleanText(255).optional().or(z.literal("")),
  body: cleanText(3000).optional().or(z.literal("")),
  icon: cleanText(16).min(1).default("📌"),
  imageUrl: cleanText(600).optional().or(z.literal("")),
  actionLabel: cleanText(80).optional().or(z.literal("")),
  targetScreen: cleanText(64).optional().or(z.literal("")),
  price: z.coerce.number().min(0).max(9999999).default(0),
  metadata: metadataSchema,
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999999).default(0),
});

export async function GET(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;

  return NextResponse.json({ contentItems: await loadContentItems() });
}

export async function POST(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;

  let body: z.infer<typeof contentSchema>;
  try {
    body = await parseJsonBody(request, contentSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  try {
    await query(
      "INSERT INTO app_content_items (content_type, slug, title, subtitle, body, icon, image_url, action_label, target_screen, price, metadata, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      contentParams(body),
    );
  } catch (error) {
    if (isDuplicateContent(error)) return NextResponse.json({ message: "Slug นี้ถูกใช้งานแล้วในประเภทนี้" }, { status: 409 });
    throw error;
  }

  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('content.create', 'app_content_items', ?, JSON_OBJECT('contentType', ?, 'slug', ?, 'title', ?))", [
    body.slug,
    body.contentType,
    body.slug,
    body.title,
  ]);
  return GET(request);
}

export async function PUT(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;

  let body: z.infer<typeof contentSchema> & { id: number };
  try {
    body = await parseJsonBody(request, contentSchema.extend({ id: z.coerce.number().positive() }));
  } catch (error) {
    return validationErrorResponse(error);
  }

  try {
    await query(
      "UPDATE app_content_items SET content_type = ?, slug = ?, title = ?, subtitle = ?, body = ?, icon = ?, image_url = ?, action_label = ?, target_screen = ?, price = ?, metadata = ?, active = ?, sort_order = ? WHERE id = ?",
      [...contentParams(body), body.id],
    );
  } catch (error) {
    if (isDuplicateContent(error)) return NextResponse.json({ message: "Slug นี้ถูกใช้งานแล้วในประเภทนี้" }, { status: 409 });
    throw error;
  }

  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('content.update', 'app_content_items', ?, JSON_OBJECT('contentType', ?, 'slug', ?, 'title', ?))", [
    String(body.id),
    body.contentType,
    body.slug,
    body.title,
  ]);
  return GET(request);
}

export async function DELETE(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ message: "Missing content id" }, { status: 400 });

  await query("UPDATE app_content_items SET active = FALSE WHERE id = ?", [id]);
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id) VALUES ('content.delete', 'app_content_items', ?)", [String(id)]);
  return GET(request);
}

function loadContentItems() {
  return query(
    "SELECT id, content_type contentType, slug, title, subtitle, body, icon, image_url imageUrl, action_label actionLabel, target_screen targetScreen, price, CAST(metadata AS CHAR) metadata, active, sort_order sortOrder, created_at createdAt, updated_at updatedAt FROM app_content_items ORDER BY active DESC, content_type, sort_order, id DESC LIMIT 500",
  );
}

function contentParams(body: z.infer<typeof contentSchema>) {
  return [
    body.contentType,
    body.slug,
    body.title,
    body.subtitle || null,
    body.body || null,
    body.icon,
    body.imageUrl || null,
    body.actionLabel || null,
    body.targetScreen || null,
    body.price,
    JSON.stringify(body.metadata),
    body.active,
    body.sortOrder,
  ];
}

function isDuplicateContent(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY";
}
