import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookieName, assertAdminRequest, getAdminIdentity, hasAdminPermission } from "@/lib/admin-auth";
import { loadDashboard } from "@/lib/admin-dashboard";

// Fresh dashboard figures for the signed-in staff member (polled while the dashboard is open).
export async function GET(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const admin = await getAdminIdentity(request.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return NextResponse.json({ message: "Admin access denied" }, { status: 401 });
  const snapshot = await loadDashboard((permission) => hasAdminPermission(admin, permission));
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
}
