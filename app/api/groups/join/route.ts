import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({ groupId: z.number().int().positive() });

type GroupLock = { id: number; ownerUserId: number; maxPlayers: number; status: string; isOpen: number };

async function readInput(req: Request, key: string) {
  const limited = checkRateLimit({ key: `${key}:${await clientIp()}`, limit: 30, windowMs: 60_000 });
  if (limited) return { response: limited };
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return { response: authErrorResponse(error) };
  }
  try {
    return { user, input: await parseJsonBody(req, schema) };
  } catch (error) {
    return { response: validationErrorResponse(error) };
  }
}

// Join a Find Your Game slot. The group row lock serializes concurrent joins so the
// player count can never exceed max_players.
export async function POST(req: Request) {
  const { response, user, input } = await readInput(req, "groups-join");
  if (response) return response;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      "SELECT id, owner_user_id ownerUserId, max_players maxPlayers, status, (play_at IS NULL OR play_at > NOW() - INTERVAL 1 HOUR) AS isOpen FROM groups_clubs WHERE id = ? FOR UPDATE",
      [input.groupId],
    );
    const group = (rows as GroupLock[])[0];
    if (!group || group.status !== "active" || !Number(group.isOpen)) {
      await conn.rollback();
      return NextResponse.json({ message: "ไม่พบก๊วนที่เปิดรับ" }, { status: 404 });
    }
    const [memberRows] = await conn.execute("SELECT user_id userId FROM group_members WHERE group_id = ?", [input.groupId]);
    const members = memberRows as { userId: number }[];
    if (members.some((member) => Number(member.userId) === user.id)) {
      await conn.rollback();
      return NextResponse.json({ ok: true, joined: true });
    }
    if (members.length >= Number(group.maxPlayers)) {
      await conn.rollback();
      return NextResponse.json({ message: "ก๊วนนี้เต็มแล้ว" }, { status: 409 });
    }
    await conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", [input.groupId, user.id]);
    await conn.commit();
    return NextResponse.json({ ok: true, joined: true }, { status: 201 });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Leave a slot. Owners close the group instead (DELETE /api/groups?id=).
export async function DELETE(req: Request) {
  const { response, user, input } = await readInput(req, "groups-leave");
  if (response) return response;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute("SELECT id, owner_user_id ownerUserId, max_players maxPlayers, status, 1 AS isOpen FROM groups_clubs WHERE id = ? FOR UPDATE", [input.groupId]);
    const group = (rows as GroupLock[])[0];
    if (!group) {
      await conn.rollback();
      return NextResponse.json({ message: "ไม่พบก๊วนที่เปิดรับ" }, { status: 404 });
    }
    if (Number(group.ownerUserId) === user.id) {
      await conn.rollback();
      return NextResponse.json({ message: "เจ้าของก๊วนออกจากก๊วนไม่ได้ ใช้ปุ่มปิดก๊วนแทน" }, { status: 409 });
    }
    await conn.execute("DELETE FROM group_members WHERE group_id = ? AND user_id = ?", [input.groupId, user.id]);
    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
