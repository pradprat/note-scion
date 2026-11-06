import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, safeNext } from "@/lib/origin";
import { createSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

// POST /session — log in. A plain form post, so it works with or without
// JavaScript (see the note in ../actions.ts on why this is not a server action).

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function backToLogin(request: NextRequest, next: string, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", next);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = safeNext(form.get("next"));

  if (!isSameOrigin(request)) return backToLogin(request, next, "origin");

  const expected = process.env.NOTES_PASSWORD;
  if (!expected || !process.env.NOTES_SESSION_SECRET) {
    return backToLogin(request, next, "config");
  }

  const password = form.get("password");
  // Hash both sides so the comparison is constant-time regardless of length.
  const ok =
    typeof password === "string" && timingSafeEqual(sha256(password), sha256(expected));
  if (!ok) {
    // Blunts online guessing without needing a store for attempt counts.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return backToLogin(request, next, "password");
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
