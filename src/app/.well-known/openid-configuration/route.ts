import { issuerFor, json, preflight, serverMetadata } from "@/lib/oauth";

// Some MCP clients look for OpenID discovery first; serve the same OAuth metadata.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return json(serverMetadata(issuerFor(request)));
}

export const OPTIONS = preflight;
