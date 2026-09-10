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
let nextPruneAt = 0;

export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_BASE_URL || request.url).origin;
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expected && origin !== new URL(request.url).origin)) {
    return jsonError("Cross-origin request denied", 403);
  }
  return null;
}

export function jsonError(message: string, status = 400) {
  return secureResponse(NextResponse.json({ message }, { status }));
}

export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>) {
  try {
    if (assertSameOrigin(request)) throw new RequestValidationError(403);
    return schema.parse(JSON.parse((await readRequestBody(request, 256 * 1024)).toString("utf8")));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      throw new RequestValidationError();
    }
    throw error;
  }
}

export class RequestValidationError extends Error {
  constructor(public status = 400) {
    super("Invalid request payload");
    this.name = "RequestValidationError";
  }
}

export async function readRequestBody(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestValidationError();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RequestValidationError(413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

export function validationErrorResponse(error: unknown) {
  if (error instanceof RequestValidationError && error.status === 413) return jsonError("Request body too large", 413);
  if (error instanceof RequestValidationError && error.status === 403) return jsonError("Cross-origin request denied", 403);
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
    if (buckets.size >= 10_000 && !current) return jsonError("Too many requests", 429);
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
  if (now < nextPruneAt) return;
  nextPruneAt = now + 30_000;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
