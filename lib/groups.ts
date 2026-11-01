import { query } from "@/lib/db";

export type GroupRow = {
  id: number;
  name: string;
  levelName: string;
  description: string | null;
  sportSlug: string;
  sportName: string;
  sportIcon: string;
  maxPlayers: number;
  memberCount: number;
  playAt: string | null;
  joined: number;
  isOwner: number;
};

export const GROUP_MAX_DAYS_AHEAD = 60;

// Find Your Game slots with live player counts. Groups more than an hour past their
// start time are hidden; groups without a time stay listed until the owner closes them.
export function listGroups(userId: number, limit: number) {
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(Number(limit)) || 1));
  return query<GroupRow>(
    "SELECT g.id, g.name, g.level_name levelName, g.description, s.slug sportSlug, s.name_th sportName, s.icon sportIcon, g.max_players maxPlayers, g.play_at playAt, " +
      "(SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) memberCount, " +
      "EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = ?) joined, g.owner_user_id = ? isOwner " +
      "FROM groups_clubs g JOIN sports s ON s.id = g.sport_id " +
      "WHERE g.status = 'active' AND (g.play_at IS NULL OR g.play_at > NOW() - INTERVAL 1 HOUR) " +
      // Open slots first so full groups never push joinable ones off the home row.
      "ORDER BY (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) >= g.max_players, g.play_at IS NULL, g.play_at, g.created_at DESC " +
      `LIMIT ${safeLimit}`,
    [userId, userId],
  );
}

// "YYYY-MM-DDTHH:mm" in Bangkok time → SQL wall-clock DATETIME, or null when it is not
// a real time in the future within the allowed window.
export function groupPlayAt(value: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const time = new Date(`${value}:00+07:00`).getTime();
  if (!Number.isFinite(time) || new Date(time + 7 * 3_600_000).toISOString().slice(0, 16) !== value) return null;
  if (time <= now || time > now + GROUP_MAX_DAYS_AHEAD * 86_400_000) return null;
  return `${value.replace("T", " ")}:00`;
}
