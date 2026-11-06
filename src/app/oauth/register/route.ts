import {
  AUTH_METHODS,
  isAllowedRedirectUri,
  json,
  OAuthError,
  oauthErrorResponse,
  preflight,
  registerClient,
  type AuthMethod,
} from "@/lib/oauth";

// RFC 7591 dynamic client registration. Open by design: registering only lets an
// app *ask*; nothing is granted until you log in and approve it on the consent page.

export const dynamic = "force-dynamic";

const invalid = (error: string, description: string) =>
  json({ error, error_description: description }, 400);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return invalid("invalid_client_metadata", "Body must be JSON");
  }

  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > 10 ||
    !redirectUris.every((uri) => typeof uri === "string" && uri.length <= 2000 && isAllowedRedirectUri(uri))
  ) {
    return invalid("invalid_redirect_uri", "redirect_uris must be 1-10 https, loopback http or app-scheme URIs");
  }

  const method = (body.token_endpoint_auth_method ?? "none") as AuthMethod;
  if (!AUTH_METHODS.includes(method)) {
    return invalid("invalid_client_metadata", `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(", ")}`);
  }

  const grantTypes = (body.grant_types as string[] | undefined) ?? ["authorization_code", "refresh_token"];
  if (!Array.isArray(grantTypes) || !grantTypes.includes("authorization_code")) {
    return invalid("invalid_client_metadata", "grant_types must include authorization_code");
  }

  const clientName =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim().slice(0, 100)
      : null;

  let registered: Awaited<ReturnType<typeof registerClient>>;
  try {
    registered = await registerClient({
      redirectUris: redirectUris as string[],
      clientName,
      authMethod: method,
    });
  } catch (error) {
    if (error instanceof OAuthError) return oauthErrorResponse(error);
    throw error;
  }
  const { clientId, clientSecret } = registered;

  return json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName ?? undefined,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: method,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "notes",
    },
    201
  );
}

export const OPTIONS = preflight;
