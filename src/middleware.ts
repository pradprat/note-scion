import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/session";

// Sends logged-out visitors to the login page. A convenience only: every loader and
// server action checks the session again itself.
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (await verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  // 303 for form posts so the browser follows with a GET instead of re-posting.
  return NextResponse.redirect(url, request.method === "GET" ? 307 : 303);
}

export const config = {
  // Everything except what has to work without a browser session: the login page and
  // the login/logout endpoints, the MCP endpoint and the OAuth endpoints Claude calls
  // (each checks its own bearer token or client credentials), and static files.
  matcher: [
    "/((?!login|session|api/mcp|oauth/register|oauth/token|oauth/revoke|\\.well-known|_next/|favicon\\.ico|icon|apple-icon|robots\\.txt).*)",
  ],
};
