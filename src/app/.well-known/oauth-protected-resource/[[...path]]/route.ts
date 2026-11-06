import { issuerFor, json, preflight, resourceMetadata } from "@/lib/oauth";

// Served at /.well-known/oauth-protected-resource and at the path-suffixed form
// /.well-known/oauth-protected-resource/api/mcp that MCP clients try first.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return json(resourceMetadata(issuerFor(request)));
}

export const OPTIONS = preflight;
