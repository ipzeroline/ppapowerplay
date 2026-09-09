import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashQrToken } from "@/lib/qr";
import { query } from "@/lib/db";
import { checkRateLimit, clientIp, secureResponse } from "@/lib/security";

const tokenSchema = z.string().min(32).max(160);

export async function GET(req: NextRequest) {
  const limited = checkRateLimit({ key: `qr-verify:${await clientIp()}`, limit: 90, windowMs: 60_000 });
  if (limited) return limited;
  const token = tokenSchema.safeParse(req.nextUrl.searchParams.get("token") || "");
  if (!token.success) return secureResponse(NextResponse.json({ valid: false, message: "QR ไม่ถูกต้อง" }, { status: 400 }));

  const row = (
    await query<{
      purpose: string;
      refId: string | null;
      expiresAt: string;
      usedAt: string | null;
      expired: number;
    }>(
      "SELECT qt.purpose, qt.ref_id refId, qt.expires_at expiresAt, qt.used_at usedAt, qt.expires_at < NOW() expired FROM qr_tokens qt WHERE qt.token_hash = ? LIMIT 1",
      [hashQrToken(token.data)],
    )
  )[0];
  if (!row) return secureResponse(NextResponse.json({ valid: false, message: "ไม่พบ QR" }, { status: 404 }));

  const valid = !row.usedAt && !Boolean(row.expired);
  return secureResponse(
    NextResponse.json({
      valid,
      purpose: row.purpose,
      refId: row.refId,
      expiresAt: row.expiresAt,
      used: Boolean(row.usedAt),
      expired: Boolean(row.expired),
    }),
  );
}
