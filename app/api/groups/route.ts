import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { pool, query } from "@/lib/db";
import { groupPlayAt, listGroups } from "@/lib/groups";
import { assertSameOrigin, checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  sportSlug: z.string().min(1).max(64),
  name: z.string().trim().min(2).max(160),
  levelName: z.string().trim().min(2).max(80),
  description: z.string().max(1000).optional(),
  maxPlayers: z.number().int().min(2).max(30).default(4),
  playAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
});

export async function GET() {
  const limited = checkRateLimit({ key: `groups-get:${await clientIp()}`, limit: 90, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  return NextResponse.json({ groups: await listGroups(user.id, 50) });
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
  const playAt = input.playAt ? groupPlayAt(input.playAt) : null;
  if (input.playAt && !playAt) return NextResponse.json({ message: "เวลานัดเล่นต้องอยู่ในอนาคตและไม่เกิน 60 วัน" }, { status: 400 });
  const sport = (await query<{ id: number }>("SELECT id FROM sports WHERE slug = ? AND active = TRUE LIMIT 1", [input.sportSlug]))[0];
  if (!sport) return NextResponse.json({ message: "ไม่พบกีฬา" }, { status: 404 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      "INSERT INTO groups_clubs (owner_user_id, sport_id, name, level_name, max_players, play_at, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [user.id, sport.id, input.name, input.levelName, input.maxPlayers, playAt, input.description || null],
    );
    const groupId = Number((result as { insertId?: number }).insertId || 0);
    // The owner takes the first player spot.
    await conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", [groupId, user.id]);
    await conn.commit();
    return NextResponse.json({ ok: true, groupId }, { status: 201 });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Owner closes a group so it no longer appears in Find Your Game.
export async function DELETE(req: NextRequest) {
  // No JSON body here, so check the origin explicitly (parseJsonBody does it for other mutations).
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const limited = checkRateLimit({ key: `groups-delete:${await clientIp()}`, limit: 12, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
  const result = (await query("UPDATE groups_clubs SET status = 'archived' WHERE id = ? AND owner_user_id = ? AND status = 'active'", [id, user.id])) as unknown as { affectedRows?: number };
  if (!result.affectedRows) return NextResponse.json({ message: "ปิดได้เฉพาะก๊วนที่คุณสร้าง" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
