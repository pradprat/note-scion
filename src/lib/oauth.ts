import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { sql } from "./db";

// OAuth 2.1 authorization server for the notes MCP endpoint (the MCP auth spec):
// dynamic client registration, authorization code + PKCE (S256 only), rotating
// refresh tokens and RFC 8707 resource binding. Only hashes are stored.

export const SCOPE = "notes";
export const MCP_PATH = "/api/mcp";
export const AUTHORIZE_PATH = "/oauth/authorize";

const CODE_TTL = 5 * 60;
const ACCESS_TTL = 60 * 60;
const REFRESH_TTL = 30 * 24 * 60 * 60;

export type AuthMethod = "none" | "client_secret_post" | "client_secret_basic";
export const AUTH_METHODS: AuthMethod[] = ["none", "client_secret_post", "client_secret_basic"];

export interface OAuthClient {
  clientId: string;
  clientSecretHash: string | null;
  clientName: string | null;
  redirectUris: string[];
  authMethod: AuthMethod;
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public status = 400
  ) {
    super(description);
  }
}

// ---------------------------------------------------------------- primitives

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** The site origin as the request saw it. */
export function issuerFor(request: Request): string {
  return new URL(request.url).origin;
}

export function resourceFor(request: Request): string {
  return `${issuerFor(request)}${MCP_PATH}`;
}

const trimSlash = (value: string) => value.replace(/\/+$/, "");

export function sameResource(a: string, b: string): boolean {
  return trimSlash(a) === trimSlash(b);
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

export function oauthErrorResponse(error: OAuthError) {
  const extra: Record<string, string> =
    error.status === 401 ? { "www-authenticate": 'Basic realm="notes-oauth"' } : {};
  return json({ error: error.code, error_description: error.description }, error.status, extra);
}

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

/** RFC 8414 authorization server metadata. */
export function serverMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}${AUTHORIZE_PATH}`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: AUTH_METHODS,
    revocation_endpoint_auth_methods_supported: AUTH_METHODS,
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function resourceMetadata(issuer: string) {
  return {
    resource: `${issuer}${MCP_PATH}`,
    authorization_servers: [issuer],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "note-scion",
  };
}

// ------------------------------------------------------------ redirect URIs

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "about:", "blob:"]);

/** https anywhere, http only on loopback, or a native app's private-use scheme. */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (BLOCKED_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "http:") return LOOPBACK.has(url.hostname);
  return true;
}

/** Exact match, except loopback redirects may use any port (RFC 8252 §7.3). */
export function redirectMatches(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true;
  let candidate: URL;
  try {
    candidate = new URL(uri);
  } catch {
    return false;
  }
  if (candidate.protocol !== "http:" || !LOOPBACK.has(candidate.hostname)) return false;
  return registered.some((entry) => {
    try {
      const known = new URL(entry);
      return (
        known.protocol === "http:" &&
        known.hostname === candidate.hostname &&
        known.pathname === candidate.pathname &&
        known.search === candidate.search
      );
    } catch {
      return false;
    }
  });
}

// ------------------------------------------------------------------- clients

function toClient(row: Record<string, unknown>): OAuthClient {
  return {
    clientId: row.client_id as string,
    clientSecretHash: (row.client_secret_hash as string | null) ?? null,
    clientName: (row.client_name as string | null) ?? null,
    redirectUris: (row.redirect_uris as string[]) ?? [],
    authMethod: row.token_endpoint_auth_method as AuthMethod,
  };
}

export async function getClient(clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== "string" || !clientId || clientId.length > 200) return null;
  const rows = await sql()`select * from oauth_clients where client_id = ${clientId}`;
  return rows[0] ? toClient(rows[0]) : null;
}

export async function registerClient(input: {
  redirectUris: string[];
  clientName: string | null;
  authMethod: AuthMethod;
}): Promise<{ clientId: string; clientSecret: string | null }> {
  const clientId = `mcp_${randomToken(18)}`;
  const clientSecret = input.authMethod === "none" ? null : randomToken(32);
  await sql()`
    insert into oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method)
    values (${clientId}, ${clientSecret ? hashToken(clientSecret) : null}, ${input.clientName},
            ${input.redirectUris}, ${input.authMethod})`;
  return { clientId, clientSecret };
}

/**
 * Identifies the client at the token and revocation endpoints: public clients by
 * client_id alone, confidential ones by secret (HTTP Basic or form body).
 */
export async function authenticateClient(request: Request, form: URLSearchParams) {
  let clientId = form.get("client_id");
  let secret = form.get("client_secret");
  let usedBasic = false;

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon > 0) {
        clientId = decodeURIComponent(decoded.slice(0, colon));
        secret = decodeURIComponent(decoded.slice(colon + 1));
        usedBasic = true;
      }
    } catch {
      throw new OAuthError("invalid_client", "Malformed Basic credentials", 401);
    }
  }

  const client = await getClient(clientId);
  if (!client) throw new OAuthError("invalid_client", "Unknown client", 401);

  if (client.authMethod === "none") return client;
  if (!secret || !client.clientSecretHash) {
    throw new OAuthError("invalid_client", "Client authentication required", 401);
  }
  if (client.authMethod === "client_secret_basic" && !usedBasic && !form.get("client_secret")) {
    throw new OAuthError("invalid_client", "Client authentication required", 401);
  }
  if (!safeEqual(hashToken(secret), client.clientSecretHash)) {
    throw new OAuthError("invalid_client", "Client authentication failed", 401);
  }
  return client;
}

// ------------------------------------------------------- authorization request

export interface AuthRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string | null;
  resource: string | null;
}

export type AuthValidation =
  | { ok: true; client: OAuthClient; req: AuthRequest }
  /** Can't trust redirect_uri: show the error on our own page. */
  | { ok: false; redirect: null; message: string }
  /** Safe to report back to the client's redirect_uri. */
  | { ok: false; redirect: string; message: string };

export function errorRedirect(
  redirectUri: string,
  issuer: string,
  state: string | null,
  error: string,
  description?: string
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("iss", issuer);
  return url.toString();
}

export async function validateAuthRequest(
  params: Record<string, string | undefined>,
  issuer: string,
  resource: string
): Promise<AuthValidation> {
  const client = await getClient(params.client_id);
  if (!client) return { ok: false, redirect: null, message: "This app isn't registered here." };

  const redirectUri =
    params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) {
    return { ok: false, redirect: null, message: "The app sent a redirect address it didn't register." };
  }

  const state = params.state ?? null;
  const bounce = (error: string, description: string): AuthValidation => ({
    ok: false,
    redirect: errorRedirect(redirectUri, issuer, state, error, description),
    message: description,
  });

  if (params.response_type !== "code") {
    return bounce("unsupported_response_type", "Only response_type=code is supported");
  }
  const challenge = params.code_challenge;
  if (!challenge || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    return bounce("invalid_request", "A PKCE code_challenge is required");
  }
  if (params.code_challenge_method !== "S256") {
    return bounce("invalid_request", "code_challenge_method must be S256");
  }
  const requested = (params.scope ?? "").split(" ").filter(Boolean);
  if (requested.some((scope) => scope !== SCOPE)) {
    return bounce("invalid_scope", `The only scope is "${SCOPE}"`);
  }
  if (params.resource && !sameResource(params.resource, resource)) {
    return bounce("invalid_target", "Unknown resource");
  }

  return {
    ok: true,
    client,
    req: {
      clientId: client.clientId,
      redirectUri,
      codeChallenge: challenge,
      scope: SCOPE,
      state,
      resource: params.resource ? resource : null,
    },
  };
}

// --------------------------------------------------------------------- codes

export async function issueCode(req: AuthRequest): Promise<string> {
  const code = randomToken(32);
  await sql()`delete from oauth_codes where expires_at < now()`;
  await sql()`
    insert into oauth_codes (code_hash, client_id, redirect_uri, code_challenge, scope, resource, expires_at)
    values (${hashToken(code)}, ${req.clientId}, ${req.redirectUri}, ${req.codeChallenge},
            ${req.scope}, ${req.resource}, now() + make_interval(secs => ${CODE_TTL}))`;
  return code;
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}

// -------------------------------------------------------------------- tokens

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(
  clientId: string,
  scope: string,
  resource: string | null,
  familyId: string
): Promise<TokenResponse> {
  const access = randomToken(32);
  const refresh = randomToken(32);
  await sql()`delete from oauth_tokens where expires_at < now() - interval '1 day'`;
  await sql()`
    insert into oauth_tokens (token_hash, kind, family_id, client_id, scope, resource, expires_at)
    values
      (${hashToken(access)}, 'access', ${familyId}, ${clientId}, ${scope}, ${resource},
       now() + make_interval(secs => ${ACCESS_TTL})),
      (${hashToken(refresh)}, 'refresh', ${familyId}, ${clientId}, ${scope}, ${resource},
       now() + make_interval(secs => ${REFRESH_TTL}))`;
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope };
}

export async function exchangeCode(
  client: OAuthClient,
  form: URLSearchParams,
  resource: string
): Promise<TokenResponse> {
  const code = form.get("code");
  const verifier = form.get("code_verifier");
  if (!code || !verifier) throw new OAuthError("invalid_request", "code and code_verifier are required");

  // Single use: the row is gone whether or not the rest succeeds.
  const rows = await sql()`
    delete from oauth_codes where code_hash = ${hashToken(code)}
    returning client_id, redirect_uri, code_challenge, scope, resource, expires_at > now() as live`;
  const row = rows[0];
  if (!row || !row.live) throw new OAuthError("invalid_grant", "Invalid or expired code");
  if (row.client_id !== client.clientId) throw new OAuthError("invalid_grant", "Code was issued to another client");

  const redirectUri = form.get("redirect_uri");
  if (redirectUri !== null && redirectUri !== row.redirect_uri) {
    throw new OAuthError("invalid_grant", "redirect_uri does not match the authorization request");
  }
  if (!pkceMatches(verifier, row.code_challenge as string)) {
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  }
  const requested = form.get("resource");
  if (requested && !sameResource(requested, resource)) {
    throw new OAuthError("invalid_target", "Unknown resource");
  }

  return issueTokens(client.clientId, row.scope as string, (row.resource as string | null) ?? (requested ? resource : null), randomUUID());
}

export async function refreshTokens(client: OAuthClient, form: URLSearchParams): Promise<TokenResponse> {
  const token = form.get("refresh_token");
  if (!token) throw new OAuthError("invalid_request", "refresh_token is required");

  const rows = await sql()`
    select family_id, client_id, scope, resource, revoked, expires_at > now() as live
    from oauth_tokens where token_hash = ${hashToken(token)} and kind = 'refresh'`;
  const row = rows[0];
  if (!row || row.client_id !== client.clientId) throw new OAuthError("invalid_grant", "Invalid refresh token");
  if (row.revoked) {
    // A rotated-out refresh token came back: assume it leaked and end the whole grant.
    await sql()`update oauth_tokens set revoked = true where family_id = ${row.family_id}`;
    throw new OAuthError("invalid_grant", "Refresh token was already used");
  }
  if (!row.live) throw new OAuthError("invalid_grant", "Refresh token expired");

  await sql()`update oauth_tokens set revoked = true where token_hash = ${hashToken(token)}`;
  return issueTokens(client.clientId, row.scope as string, (row.resource as string | null) ?? null, row.family_id as string);
}

/** RFC 7009: revoking a refresh token ends its whole grant. Unknown tokens are not an error. */
export async function revokeToken(client: OAuthClient, token: string): Promise<void> {
  const rows = await sql()`
    select family_id, kind from oauth_tokens
    where token_hash = ${hashToken(token)} and client_id = ${client.clientId}`;
  const row = rows[0];
  if (!row) return;
  if (row.kind === "refresh") {
    await sql()`update oauth_tokens set revoked = true where family_id = ${row.family_id}`;
  } else {
    await sql()`update oauth_tokens set revoked = true where token_hash = ${hashToken(token)}`;
  }
}

// --------------------------------------------------------------- connections

export interface Connection {
  clientId: string;
  name: string | null;
  redirectUris: string[];
  /** When the app first registered itself. */
  addedAt: string;
  /** Latest token issued to it: an approval or an hourly refresh. */
  lastActiveAt: string;
}

/** Apps that can still reach the notes: they hold a live, unrevoked refresh token. */
export async function listConnections(): Promise<Connection[]> {
  const rows = await sql()`
    select c.client_id, c.client_name, c.redirect_uris, c.created_at,
           (select max(t2.created_at) from oauth_tokens t2 where t2.client_id = c.client_id) as last_active
    from oauth_clients c
    where exists (
      select 1 from oauth_tokens t
      where t.client_id = c.client_id and t.kind = 'refresh' and not t.revoked and t.expires_at > now()
    )
    order by last_active desc nulls last`;
  return rows.map((row) => ({
    clientId: row.client_id as string,
    name: (row.client_name as string | null) ?? null,
    redirectUris: (row.redirect_uris as string[]) ?? [],
    addedAt: new Date(row.created_at as string).toISOString(),
    lastActiveAt: new Date((row.last_active ?? row.created_at) as string).toISOString(),
  }));
}

/**
 * Ends every grant an app holds. Its access tokens stop working at once; to come back it
 * has to ask for consent again.
 */
export async function disconnectClient(clientId: string): Promise<void> {
  await sql()`update oauth_tokens set revoked = true where client_id = ${clientId} and not revoked`;
}

/** True when the bearer token is a live access token meant for this MCP endpoint. */
export async function verifyAccessToken(token: string, resource: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const rows = await sql()`
    select resource from oauth_tokens
    where token_hash = ${hashToken(token)} and kind = 'access'
      and not revoked and expires_at > now()`;
  const row = rows[0];
  if (!row) return false;
  return !row.resource || sameResource(row.resource as string, resource);
}
