import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin, checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";
import { policyVersionOf, policyVersionPattern } from "@/lib/site-settings";

const schema = z.object({ version: z.string().regex(policyVersionPattern) });

// PDPA consent: records that the member accepted the privacy policy version currently published.
export async function POST(req: Request) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const limited = checkRateLimit({ key: `consent:${await clientIp()}`, limit: 20, windowMs: 60_000 });
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
  const [policy] = await query<{ metadata: string | null }>(
    "SELECT CAST(metadata AS CHAR) metadata FROM app_content_items WHERE content_type = 'site_setting' AND slug = 'privacy-policy' AND active = TRUE LIMIT 1",
  );
  // Same reading as the app (lib/site-settings.ts); a policy without a usable version is not shown.
  const current = policy ? policyVersionOf(policy.metadata) : null;
  if (!current) return NextResponse.json({ message: "ยังไม่มีนโยบายที่เปิดใช้งาน" }, { status: 404 });
  if (current !== input.version) {
    return NextResponse.json({ message: "นโยบายมีการปรับปรุง กรุณาอ่านฉบับล่าสุดอีกครั้ง" }, { status: 409 });
  }
  await query("UPDATE users SET pdpa_accepted_at = NOW(), pdpa_version = ? WHERE id = ?", [input.version, user.id]);
  return NextResponse.json({ acceptedAt: new Date().toISOString(), version: input.version });
}
