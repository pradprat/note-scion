import { type NextRequest } from "next/server";
import { hasSession } from "@/lib/auth";
import { loadImage } from "@/lib/db";

// GET /api/images/<id> — a picture from a page, for a signed-in browser only.

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return new Response("Sign in first.", { status: 401 });

  const image = await loadImage((await params).id);
  if (!image) return new Response("Not found.", { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes.byteLength),
      // An id always shows the same bytes, so the browser may keep it for good, but only for itself.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Should the file ever be opened on its own, it can run nothing.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
