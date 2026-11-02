import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pushAfterResponse, pushText } from "@/lib/notify";
import { cancelStalePayments, runJob, sendReminders } from "@/lib/scheduled-jobs";

const digest = (value: string) => createHash("sha256").update(value).digest();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Scheduled job (cron every 5-15 minutes, see README): auto-cancel stale payment requests, then
// send reminders. Off (404) until CRON_SECRET is set; callers send "Authorization: Bearer <secret>".
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return json({ message: "Not found" }, 404);
  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(digest(given), digest(secret))) return json({ message: "Unauthorized" }, 401);
  const cancelled = await runJob(cancelStalePayments);
  const reminders = await runJob(sendReminders);
  for (const notice of [...cancelled, ...reminders]) pushAfterResponse(notice.userId, pushText(notice.title, notice.body));
  return json({ cancelled: cancelled.length, reminders: reminders.length });
}
