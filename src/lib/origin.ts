import type { NextRequest } from "next/server";

/** Rejects form posts from other sites. Browsers always send Origin on a form POST. */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * Only ever send people back to a path on this site: never another host (`//evil`,
 * `/\evil`), and never back to the login or logout endpoints.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (value.startsWith("/login") || value.startsWith("/session")) return "/";
  return value;
}
