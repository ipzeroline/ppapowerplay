import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitEntry>();

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>) {
  try {
    return schema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      throw new RequestValidationError();
    }
    throw error;
  }
}

export class RequestValidationError extends Error {
  constructor() {
    super("Invalid request payload");
    this.name = "RequestValidationError";
  }
}

export function validationErrorResponse(error: unknown) {
  if (error instanceof RequestValidationError || error instanceof ZodError || error instanceof SyntaxError) {
    return jsonError("ข้อมูลที่ส่งมาไม่ถูกต้อง", 400);
  }
  throw error;
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  pruneExpiredBuckets(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  current.count += 1;
  if (current.count <= limit) return null;

  return NextResponse.json(
    { message: "ใช้งานถี่เกินไป กรุณาลองใหม่อีกครั้ง" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)) },
    },
  );
}

export async function clientIp() {
  const headerStore = await headers();
  const forwarded = headerStore.get("cf-connecting-ip") || headerStore.get("x-real-ip") || headerStore.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

export function secureResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  return response;
}

function pruneExpiredBuckets(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
