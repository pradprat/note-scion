import { issuerFor, json, preflight, serverMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return json(serverMetadata(issuerFor(request)));
}

export const OPTIONS = preflight;
