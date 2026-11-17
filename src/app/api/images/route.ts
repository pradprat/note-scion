import { NextResponse, type NextRequest } from "next/server";
import { hasSession } from "@/lib/auth";
import { saveImage } from "@/lib/db";
import { IMAGE_TYPES, imageUrl, MAX_IMAGE_BYTES, sniffImageType } from "@/lib/images";
import { isSameOrigin } from "@/lib/origin";

// POST /api/images — keeps a picture pasted into a page. The body is the file itself
// (Content-Type says what the browser thinks it is; the first bytes decide). Replies with
// the URL to put in the page.

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  if (!(await hasSession())) return fail("Sign in first.", 401);
  if (!isSameOrigin(request)) return fail("That request came from somewhere else.", 403);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) return fail("That image is too large.", 413);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) return fail("No image in the request.", 400);
  if (bytes.byteLength > MAX_IMAGE_BYTES) return fail("That image is too large.", 413);

  const type = sniffImageType(bytes);
  if (!type) return fail(`Only ${IMAGE_TYPES.map((t) => t.slice(6)).join(", ")} images can be added.`, 415);

  const id = await saveImage(type, bytes);
  return NextResponse.json({ url: imageUrl(id) }, { status: 201 });
}
