import { NextRequest, NextResponse } from "next/server";

export function assertAdminRequest(request: NextRequest) {
  const adminKey = process.env.ADMIN_ACCESS_KEY || "";
  const allowDevOpen = process.env.NODE_ENV !== "production" && !adminKey;
  const providedKey = request.headers.get("x-admin-key") || request.nextUrl.searchParams.get("key") || "";

  if (allowDevOpen || (adminKey && providedKey === adminKey)) return null;

  return NextResponse.json({ message: "Admin access denied" }, { status: 401 });
}

