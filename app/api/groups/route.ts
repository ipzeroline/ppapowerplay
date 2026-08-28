import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  sportSlug: z.string().min(1),
  name: z.string().min(2).max(160),
  levelName: z.string().min(2).max(80),
  description: z.string().max(1000).optional(),
});

export async function GET() {
  const limited = checkRateLimit({ key: `groups-get:${await clientIp()}`, limit: 90, windowMs: 60_000 });
  if (limited) return limited;
  try {
    await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const groups = await query(
    "SELECT g.id, g.name, g.level_name levelName, g.description, s.slug sportSlug, s.name_th sportName FROM groups_clubs g JOIN sports s ON s.id = g.sport_id WHERE g.status = 'active' ORDER BY g.created_at DESC LIMIT 50",
  );
  return NextResponse.json({ groups });
}

export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `groups-post:${await clientIp()}`, limit: 12, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  let input: z.infer<typeof schema>;
  try {
    input = await parseJsonBody(req, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  const sport = (await query<{ id: number }>("SELECT id FROM sports WHERE slug = ? LIMIT 1", [input.sportSlug]))[0];
  if (!sport) return NextResponse.json({ message: "ไม่พบกีฬา" }, { status: 404 });
  await query("INSERT INTO groups_clubs (owner_user_id, sport_id, name, level_name, description) VALUES (?, ?, ?, ?, ?)", [
    user.id,
    sport.id,
    input.name,
    input.levelName,
    input.description || null,
  ]);
  return NextResponse.json({ ok: true }, { status: 201 });
}
