import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/origin";
import { errorRedirect, issueCode, issuerFor, resourceFor, validateAuthRequest } from "@/lib/oauth";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/session";

// The consent form posts here. Everything is validated again: the hidden fields
// came back from the browser and are not trusted.

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });

  const form = await request.formData();
  const params: Record<string, string | undefined> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  const back = new URL("/oauth/authorize", request.url);
  for (const [key, value] of Object.entries(params)) {
    if (key !== "decision" && value !== undefined) back.searchParams.set(key, value);
  }

  if (!(await verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${back.pathname}${back.search}`);
    return NextResponse.redirect(login, 303);
  }

  const issuer = issuerFor(request);
  const result = await validateAuthRequest(params, issuer, resourceFor(request));
  if (!result.ok) return NextResponse.redirect(result.redirect ?? back, 303);

  const { req } = result;
  if (params.decision !== "allow") {
    return NextResponse.redirect(
      errorRedirect(req.redirectUri, issuer, req.state, "access_denied", "You declined access"),
      303
    );
  }

  const code = await issueCode(req);
  const target = new URL(req.redirectUri);
  target.searchParams.set("code", code);
  if (req.state) target.searchParams.set("state", req.state);
  target.searchParams.set("iss", issuer);
  return NextResponse.redirect(target, 303);
}
