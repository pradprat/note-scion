import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { hasSession } from "@/lib/auth";
import { MCP_PATH, validateAuthRequest } from "@/lib/oauth";

export const dynamic = "force-dynamic";

const FIELDS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function issuer(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function describeRedirect(uri: string): string {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" || url.protocol === "http:" ? url.host : `${url.protocol}//`;
  } catch {
    return uri;
  }
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params: Record<string, string | undefined> = {};
  for (const field of FIELDS) params[field] = first(raw[field]);

  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  ).toString();
  if (!(await hasSession())) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  const base = await issuer();
  const result = await validateAuthRequest(params, base, `${base}${MCP_PATH}`);
  if (!result.ok && result.redirect) redirect(result.redirect);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {!result.ok ? (
          <>
            <h1 className="mb-3 text-2xl font-semibold tracking-tight">Can&apos;t connect</h1>
            <p className="text-muted-foreground">{result.message}</p>
            <p className="mt-2 text-sm text-muted-foreground">Start the connection again from the app.</p>
          </>
        ) : (
          <>
            <h1 className="mb-3 text-2xl font-semibold tracking-tight">
              Allow {result.client.clientName ?? "this app"} to use your notes?
            </h1>
            <p className="mb-5 text-muted-foreground">
              It will be able to read, search, create, edit, move and delete every page in your
              notes until you disconnect it.
            </p>
            <dl className="mb-6 space-y-2 rounded-lg border bg-muted px-4 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">App</dt>
                <dd className="truncate font-medium">{result.client.clientName ?? "Unnamed app"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Returns to</dt>
                <dd className="truncate font-mono text-xs">{describeRedirect(result.req.redirectUri)}</dd>
              </div>
            </dl>
            <form method="post" action="/oauth/authorize/decision" className="flex gap-2">
              {FIELDS.map((field) =>
                params[field] !== undefined ? (
                  <input key={field} type="hidden" name={field} value={params[field]} />
                ) : null
              )}
              <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
                Cancel
              </Button>
              <Button type="submit" name="decision" value="allow" className="flex-1">
                Allow access
              </Button>
            </form>
            <p className="mt-4 text-xs text-muted-foreground">
              Only allow apps you are connecting yourself right now.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
