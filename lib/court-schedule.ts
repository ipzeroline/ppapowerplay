import type mysql from "mysql2/promise";

type Connection = Pick<mysql.PoolConnection, "execute">;

// A court slot is taken by an active booking (paid, checked in, or held: a NULL expiry is a
// counter hold kept until staff act) or by an active court block (maintenance, events).
export const takenBookingSql = "status IN ('paid','checked_in') OR (status IN ('hold','pending_payment') AND (expires_at IS NULL OR expires_at > NOW()))";

// The same rule with the bookings table alias, for queries that join users (which also has `status`).
export function takenBookingAs(alias: string) {
  return `${alias}.status IN ('paid','checked_in') OR (${alias}.status IN ('hold','pending_payment') AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > NOW()))`;
}

// Run inside the booking transaction after locking the court row; both reads lock what they find.
export async function courtConflict(conn: Connection, courtId: number, startsAt: string, endsAt: string): Promise<"booked" | "blocked" | null> {
  const [bookings] = await conn.execute(
    `SELECT id FROM bookings WHERE court_id = ? AND (${takenBookingSql}) AND starts_at < ? AND ends_at > ? FOR UPDATE`,
    [courtId, endsAt, startsAt],
  );
  if ((bookings as unknown[]).length) return "booked";
  const [blocks] = await conn.execute(
    "SELECT id FROM court_blocks WHERE court_id = ? AND cancelled_at IS NULL AND starts_at < ? AND ends_at > ? LIMIT 1 FOR UPDATE",
    [courtId, endsAt, startsAt],
  );
  return (blocks as unknown[]).length ? "blocked" : null;
}
