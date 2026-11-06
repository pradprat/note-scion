"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import PageView from "../../_components/page-view";
import TopBar from "../../_components/top-bar";
import { DEMO_BASE, peekPage, subscribe } from "../_lib/demo-store";

export default function DemoPage() {
  const { id } = useParams<{ id: string }>();
  const read = useCallback(() => peekPage(id), [id]);
  // A save from another tab arrives here as a newer copy; the page view handles it.
  const page = useSyncExternalStore(subscribe, read, read);

  if (!page) return <Missing />;
  // Keyed so navigating between pages remounts the editor with fresh state.
  return <PageView key={page.id} page={page} />;
}

function Missing() {
  return (
    <>
      <TopBar />
      <div className="mx-auto flex max-w-md flex-col items-start px-6 py-20 sm:py-28">
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">This page isn&apos;t here</h1>
        <p className="mb-6 text-muted-foreground">
          It may be in the trash, or it belonged to a demo that was reset. Demo pages live in the browser they were
          written in.
        </p>
        <Button asChild>
          <Link href={DEMO_BASE}>Back to the demo</Link>
        </Button>
      </div>
    </>
  );
}
