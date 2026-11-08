"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNotes } from "./notes-provider";
import TitleText from "./title-text";

/**
 * "Moved … to trash · Undo", shown while a delete can still be taken back. Drives a Sonner
 * toast (the <Toaster> lives in the shell); the provider's undo window decides how long it
 * stays, so the toast itself never times out.
 */
export default function UndoToast() {
  const { pendingDelete, undoDelete } = useNotes();
  const undoRef = useRef(undoDelete);
  undoRef.current = undoDelete;

  useEffect(() => {
    if (!pendingDelete) return;
    const id = `notes-delete-${pendingDelete.id}`;
    toast(
      <span className="min-w-0 truncate">
        Moved{" "}
        <span className="font-medium">
          <TitleText title={pendingDelete.title} />
        </span>{" "}
        to trash
      </span>,
      {
        id,
        duration: Infinity,
        action: { label: "Undo", onClick: () => undoRef.current() },
      }
    );
    return () => {
      toast.dismiss(id);
    };
  }, [pendingDelete]);

  // Mod+Z outside a text field takes the delete back too.
  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, [contenteditable='true']");
      if (!typing && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete]);

  return null;
}
