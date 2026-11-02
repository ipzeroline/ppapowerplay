import type mysql from "mysql2/promise";

type Connection = Pick<mysql.PoolConnection, "execute">;

// Walk-in and phone customers book at the counter without a LINE account. Their bookings and
// payments belong to this one system user (seeded by database/schema.sql); the guest's name and
// phone live on the booking. It is never a member: keep it out of member lists and counts.
export const WALK_IN_LINE_ID = "system:walk-in";

export function notWalkIn(alias = "u") {
  return `${alias}.line_user_id <> '${WALK_IN_LINE_ID}'`;
}

export async function walkInUserId(conn: Connection) {
  const [rows] = await conn.execute("SELECT id FROM users WHERE line_user_id = ? LIMIT 1", [WALK_IN_LINE_ID]);
  const id = Number((rows as { id: number }[])[0]?.id);
  if (!id) throw new Error("walk-in user missing");
  return id;
}
