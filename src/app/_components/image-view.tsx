"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { NoteImage } from "@/lib/image";

/** The words an image gets when nobody described it: not worth showing as a caption. */
const PLACEHOLDER_ALT = new Set(["", "Pasted image", "Image"]);

/**
 * A picture as the editor shows it: it holds its room (from the saved width and height)
 * until the file arrives, says so when the file can't be loaded, and carries a caption you
 * can type under it. The caption is the picture's description, so Claude reads it too.
 */
function ImageView({ node, selected, editor, getPos, updateAttributes }: ReactNodeViewProps) {
  const { src, alt, width, height } = node.attrs as { src: string; alt: string; width: number | null; height: number | null };
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const described = !PLACEHOLDER_ALT.has(alt);
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper className="notes-image" data-selected={selected || undefined}>
      <div
        className="notes-image-frame"
        data-state={state}
        style={width && height && state !== "ready" ? { aspectRatio: `${width} / ${height}`, maxWidth: width } : undefined}
      >
        {state === "failed" ? (
          <div className="notes-image-failed" role="img" aria-label="Image couldn't be loaded">
            <ImageOff aria-hidden size={20} />
            <span>This image couldn&apos;t be loaded</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- stored by the app, sized by its own attributes
          <img
            src={src}
            alt={alt}
            width={width ?? undefined}
            height={height ?? undefined}
            draggable={false}
            onLoad={() => setState("ready")}
            onError={() => setState("failed")}
            data-drag-handle
          />
        )}
      </div>
      {(described || (selected && editable)) && (
        <input
          className="notes-image-caption"
          value={PLACEHOLDER_ALT.has(alt) ? "" : alt}
          placeholder="Add a caption"
          aria-label="Image caption"
          readOnly={!editable}
          maxLength={300}
          onChange={(event) => updateAttributes({ alt: event.target.value })}
          onKeyDown={(event) => {
            // Enter or Escape goes back to the text after the picture.
            if (event.key !== "Enter" && event.key !== "Escape") return;
            event.preventDefault();
            const pos = getPos();
            if (pos !== undefined) editor.chain().focus().setTextSelection(pos + node.nodeSize).run();
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const ImageBlock = NoteImage.extend({
  addNodeView() {
    // The caption field is the block's own: typing in it must not reach ProseMirror.
    return ReactNodeViewRenderer(ImageView, { stopEvent: ({ event }) => (event.target as HTMLElement).tagName === "INPUT" });
  },
});
