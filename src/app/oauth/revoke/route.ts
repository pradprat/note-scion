import {
  authenticateClient,
  OAuthError,
  oauthErrorResponse,
  preflight,
  revokeToken,
  CORS_HEADERS,
} from "@/lib/oauth";

export const dynamic = "force-dynamic";

// RFC 7009 token revocation.
export async function POST(request: Request) {
  try {
    const form = new URLSearchParams(await request.text());
    const client = await authenticateClient(request, form);
    const token = form.get("token");
    if (token) await revokeToken(client, token);
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  } catch (error) {
    if (error instanceof OAuthError) return oauthErrorResponse(error);
    throw error;
  }
}

export const OPTIONS = preflight;
