import { isQrToken } from "@/lib/qr";

// The address inside every member QR: opens the staff scanner with the code filled in. Members who
// scan their own code reach the staff sign-in page, which tells them nothing about the code.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isQrToken(token)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 307, headers: { Location: `/AdminConsole/scanner?token=${token}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
