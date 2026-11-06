"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Connection } from "@/lib/oauth";

/** Taller buttons where the pointer is a finger. */
const COARSE = "[@media(pointer:coarse)]:h-10";
import { disconnectAppAction } from "../actions";
import { ago } from "./time";
import TopBar from "./top-bar";

/** "claude.ai" for https://claude.ai/api/mcp/auth_callback; custom schemes as written. */
function returnsTo(uris: string[]): string {
  const hosts = uris.map((uri) => {
    try {
      const url = new URL(uri);
      return url.protocol === "http:" || url.protocol === "https:" ? url.host : `${url.protocol}//`;
    } catch {
      return uri;
    }
  });
  return Array.from(new Set(hosts)).join(", ");
}

export default function AppsView({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setNow(Date.now()), []);

  const visible = connections.filter((app) => !gone.has(app.clientId));

  const disconnect = async (app: Connection) => {
    setError(null);
    setGone((prev) => new Set(prev).add(app.clientId));
    try {
      await disconnectAppAction(app.clientId);
      router.refresh();
    } catch {
      setGone((prev) => {
        const next = new Set(prev);
        next.delete(app.clientId);
        return next;
      });
      setError(`Couldn't disconnect ${app.name ?? "that app"}. Try again.`);
    }
  };

  return (
    <>
      <TopBar>
        <span className="flex items-center gap-1.5 px-1 text-sm">
          <Plug size={14} className="text-muted-foreground" aria-hidden /> Connected apps
        </span>
      </TopBar>

      <div className="mx-auto w-full max-w-3xl px-6 pb-40 pt-10 sm:px-16 sm:pt-16">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Connected apps</h1>
        <p className="mb-8 max-w-[60ch] text-muted-foreground">
          Apps you allowed to use your notes through the MCP connector. Each one can read, search, edit, move and
          trash every page until you disconnect it.
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}

        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="font-medium">No apps are connected</p>
            <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted-foreground">
              Add the connector in an app such as claude.ai, approve it, and it shows up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y border-y">
            {visible.map((app) => (
              <AppRow key={app.clientId} app={app} now={now} onDisconnect={() => void disconnect(app)} />
            ))}
          </ul>
        )}

        <p className="mt-8 max-w-[60ch] text-sm text-muted-foreground">
          Claude Code connects with the fixed <code className="font-mono text-xs">NOTES_MCP_TOKEN</code> instead,
          so it isn&apos;t listed. To cut it off, change that variable in the deployment.
        </p>
      </div>
    </>
  );
}

function AppRow({ app, now, onDisconnect }: { app: Connection; now: number | null; onDisconnect: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const name = app.name?.trim() || "Unnamed app";
  const meta = [
    `returns to ${returnsTo(app.redirectUris)}`,
    now !== null ? `active ${ago(app.lastActiveAt, now)}` : null,
    now !== null ? `added ${ago(app.addedAt, now)}` : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground" aria-hidden>
        <Plug size={15} />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-medium">{name}</p>
        <p className="min-h-4 truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
      </div>
      <div className="flex w-full shrink-0 items-center gap-1 pl-11 text-sm sm:w-auto sm:pl-0">
        {confirming ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} className={COARSE}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" autoFocus onClick={onDisconnect} className={COARSE}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)} className={COARSE}>
            <Unplug /> Disconnect
          </Button>
        )}
      </div>
    </li>
  );
}
