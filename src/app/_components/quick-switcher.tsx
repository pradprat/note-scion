"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { NoteNode } from "@/lib/types";
import { searchPagesAction } from "../actions";
import { useNotes } from "./notes-provider";

const SEARCH_DELAY = 180;

/** Ctrl/⌘K: jump to any page by title, find text inside pages, or start a new one. */
export default function QuickSwitcher({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Go to a page"
      description="Search pages by title or text, or type a title to start a new page."
      // Results are ranked here and partly come from the server: cmdk must not re-filter.
      commandProps={{ shouldFilter: false, loop: true }}
    >
      {/* The dialog unmounts its content when closed, so every open starts fresh. */}
      <SwitcherBody onClose={() => onOpenChange(false)} />
    </CommandDialog>
  );
}

function SwitcherBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { tree, ancestorsOf, addPage, activeId } = useNotes();
  const [query, setQuery] = useState("");
  const [textHits, setTextHits] = useState<NoteNode[]>([]);
  const [searching, setSearching] = useState(false);

  const q = query.trim().toLowerCase();

  // Titles are all in the sidebar tree already: match them instantly, best match first.
  const titleHits = useMemo(() => {
    if (!q) {
      return tree.filter((node) => node.id !== activeId).slice(0, 8);
    }
    return tree
      .map((node) => {
        const title = (node.title.trim() || "Untitled").toLowerCase();
        const at = title.indexOf(q);
        const wordStart = at === 0 || (at > 0 && /\s/.test(title[at - 1]));
        return { node, at, score: at === 0 ? 0 : wordStart ? 1 : 2 };
      })
      .filter((hit) => hit.at >= 0)
      .sort((a, b) => a.score - b.score || a.node.title.length - b.node.title.length)
      .slice(0, 8)
      .map((hit) => hit.node);
  }, [tree, q, activeId]);

  // Text inside pages lives on the server.
  useEffect(() => {
    if (q.length < 2) {
      setTextHits([]);
      setSearching(false);
      return;
    }
    let live = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const hits = await searchPagesAction(q);
        if (live) setTextHits(hits);
      } catch {
        if (live) setTextHits([]);
      } finally {
        if (live) setSearching(false);
      }
    }, SEARCH_DELAY);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  // Skip pages already listed, and ones hidden by a delete waiting to be undone.
  const bodyHits = useMemo(() => {
    const seen = new Set(titleHits.map((node) => node.id));
    const known = new Set(tree.map((node) => node.id));
    return textHits.filter((node) => !seen.has(node.id) && known.has(node.id));
  }, [titleHits, textHits, tree]);

  const openPage = (node: NoteNode) => {
    onClose();
    router.push(`/${node.id}`);
  };

  const createPage = async () => {
    onClose();
    await addPage(null, query.trim());
  };

  const pathOf = (node: NoteNode) =>
    ancestorsOf(node.id)
      .map((a) => a.title.trim() || "Untitled")
      .join(" / ");

  const pageItem = (node: NoteNode, group: string) => {
    const path = pathOf(node);
    return (
      <CommandItem key={`${group}-${node.id}`} value={`${group}-${node.id}`} onSelect={() => openPage(node)}>
        <span className="flex w-5 shrink-0 justify-center leading-none" aria-hidden>
          {node.icon ?? <FileText className="text-muted-foreground" />}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {node.title.trim() || "Untitled"}
          {path && <span className="ml-2 text-xs text-muted-foreground">{path}</span>}
        </span>
      </CommandItem>
    );
  };

  const title = query.trim();
  const nothingFound = q && !searching && titleHits.length === 0 && bodyHits.length === 0;

  return (
    <>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search pages or type a new title"
        // 16px on touch screens: iOS zooms the page into any smaller field.
        className="[@media(pointer:coarse)]:text-base"
      />
      <CommandList className="max-h-[min(24rem,60vh)]">
        {titleHits.length > 0 && (
          <CommandGroup heading={q ? "Pages" : "Jump to"}>{titleHits.map((node) => pageItem(node, "pages"))}</CommandGroup>
        )}
        {bodyHits.length > 0 && (
          <CommandGroup heading="Found in page text">{bodyHits.map((node) => pageItem(node, "text"))}</CommandGroup>
        )}
        {searching && <p className="px-4 py-2 text-xs text-muted-foreground">Searching page text…</p>}
        {nothingFound && <p className="px-4 pb-1 pt-3 text-sm text-muted-foreground">No page matches “{title}”.</p>}
        {(titleHits.length > 0 || bodyHits.length > 0) && <CommandSeparator />}
        <CommandGroup>
          <CommandItem value="create" onSelect={() => void createPage()}>
            <span className="flex w-5 shrink-0 justify-center text-muted-foreground" aria-hidden>
              <Plus />
            </span>
            <span className="min-w-0 flex-1 truncate">
              {title ? (
                <>
                  New page <span className="font-medium">“{title}”</span>
                </>
              ) : (
                "New page"
              )}
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </>
  );
}
