import type mysql from "mysql2/promise";
import { after } from "next/server";
import { query } from "@/lib/db";
import { messages } from "@/lib/i18n/messages";
import { packageMessages } from "@/lib/i18n/package-messages";

type Connection = Pick<mysql.PoolConnection, "execute">;

// In-app notification, written inside the caller's transaction.
export async function notifyMember(conn: Connection, userId: number, title: string, body: string) {
  await conn.execute("INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)", [userId, title.slice(0, 160), body.slice(0, 2000)]);
}

// Optional LINE OA push (uses the OA message quota). Off unless LINE_PUSH_ENABLED=true.
// Call after commit; failures never affect the business operation.
export async function pushLineMessage(userId: number, text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (process.env.LINE_PUSH_ENABLED !== "true" || !token) return;
  try {
    const [user] = await query<{ lineUserId: string }>("SELECT line_user_id lineUserId FROM users WHERE id = ? AND status = 'active' LIMIT 1", [userId]);
    if (!user?.lineUserId?.startsWith("U")) return;
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: user.lineUserId, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Push is best effort; the in-app notification is the record.
  }
}

const englishTitles = new Map([...messages, ...packageMessages].map(([thai, english]) => [thai, english]));

// LINE push text. The member's app language is not stored on the server, so the title carries
// Thai and English (from the app catalog); the body is the same in-app notification body.
export function pushText(title: string, body: string) {
  const english = englishTitles.get(title);
  return `${english && english !== title ? `${title} / ${english}` : title}\n${body}`;
}

// Sends the push once the response is finished (Next.js after()); outside a request
// (scripts, tests) it is sent without waiting.
export function pushAfterResponse(userId: number, text: string) {
  const task = () => pushLineMessage(userId, text);
  try {
    after(task);
  } catch {
    void task();
  }
}
