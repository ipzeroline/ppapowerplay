import { readFile } from "node:fs/promises";
import path from "node:path";

// Trainer photos uploaded while the server runs. Next serves public/ files only if they existed when
// the server started, so /uploads/trainers/<file> falls back here (next.config.ts rewrites) and the
// photo shows at once, for members and for the image optimizer.
const types: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  // Upload names are <timestamp>-<uuid>.<ext> (app/api/admin/uploads/trainers): nothing else is served.
  const match = /^[A-Za-z0-9-]{1,120}\.(jpg|png|webp)$/.exec(file);
  if (!match) return notFound();
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "uploads", "trainers", file));
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": types[match[1]], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return notFound();
  }
}
