import {
  authenticateClient,
  exchangeCode,
  json,
  OAuthError,
  oauthErrorResponse,
  preflight,
  refreshTokens,
  resourceFor,
} from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = new URLSearchParams(await request.text());
    const client = await authenticateClient(request, form);
    const grant = form.get("grant_type");

    if (grant === "authorization_code") {
      return json(await exchangeCode(client, form, resourceFor(request)));
    }
    if (grant === "refresh_token") {
      return json(await refreshTokens(client, form));
    }
    throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
  } catch (error) {
    if (error instanceof OAuthError) return oauthErrorResponse(error);
    throw error;
  }
}

export const OPTIONS = preflight;
