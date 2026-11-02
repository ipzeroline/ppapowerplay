import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Uptime monitor (every 5 minutes, see README): 200 when the app reaches its database, 503 when it
// does not. Nothing else is reported.
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await query("SELECT 1 ok");
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
