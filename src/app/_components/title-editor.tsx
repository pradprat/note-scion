"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { Extension, Node, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin } from "@tiptap/pm/state";
import { titleParts, titleText } from "@/lib/title-dates";
import { DateChip, DateCommand, dateKey } from "./date-mention";
import { applyRemoteContent } from "./remote-content";

const MAX_TITLE = 500;

/** The page title's look: Display type, one per screen. */
const TITLE_CLASS =
  "notes-title block w-full text-4xl font-bold leading-tight tracking-tight outline-none [text-wrap:balance]";

/** A title is one line: a document of exactly one paragraph, holding text and dates. */
const TitleDocument = Node.create({ name: "doc", topNode: true, content: "paragraph" });

/** The same 500-character cap the field had, counting dates as stored. */
const MaxLength = Extension.create({
  name: "titleMaxLength",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (tr) => !tr.docChanged || serialize(tr.doc).length <= MAX_TITLE,
      }),
    ];
  },
});

/** The stored title: text as typed, each date as `@YYYY-MM-DD`. */
function serialize(doc: PMNode): string {
  let out = "";
  doc.descendants((node) => {
    if (node.isText) out += (node.text ?? "").replace(/\n/g, " ");
    else if (node.type.name === "dateMention") out += `@${node.attrs.date as string}`;
    return true;
  });
  return out;
}

function toInline(title: string): JSONContent[] {
  return titleParts(title).map((part) =>
    "date" in part ? { type: "dateMention", attrs: { date: part.date } } : { type: "text", text: part.text }
  );
}

const toDoc = (title: string): JSONContent => ({
  type: "doc",
  content: [{ type: "paragraph", content: toInline(title) }],
});

export interface TitleEditorHandle {
  focusEnd: () => void;
  /** A newer title from elsewhere (Claude, another tab), without counting as an edit. */
  setTitle: (title: string) => void;
}

/**
 * The page title, as a one-line editor so "@today" in it is a live date, as it is in
 * the page body. It stores plain text with `@YYYY-MM-DD` dates (see title-dates.ts).
 * Enter moves to the body, carrying anything after the cursor down as its first line;
 * Down from the last line moves there too.
 */
const TitleEditor = forwardRef<
  TitleEditorHandle,
  {
    title: string;
    autoFocus: boolean;
    onChange: (title: string) => void;
    /** Leave for the body; `rest` is what followed the cursor, to become its first line. */
    onExit: (rest: JSONContent[] | null) => void;
  }
>(function TitleEditor({ title, autoFocus, onChange, onExit }, ref) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      TitleDocument,
      // Only the paragraph, text and undo: a title has no other blocks or marks.
      StarterKit.configure({
        document: false,
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        underline: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false,
      }),
      MaxLength,
      DateChip,
      DateCommand,
      Placeholder.configure({ placeholder: "Untitled", showOnlyCurrent: false }),
    ],
    content: toDoc(title),
    editorProps: {
      attributes: {
        class: TITLE_CLASS,
        role: "textbox",
        "aria-label": "Page title",
        "aria-multiline": "false",
      },
      handleKeyDown: (view, event) => {
        if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey) return false;
        // The "@" menu has Enter and the arrows while it's open.
        if (dateKey.getState(view.state)?.active) return false;
        // Enter on a selected date opens its calendar (DateChip), rather than leaving.
        const { selection } = view.state;
        if (
          event.key === "Enter" &&
          selection instanceof NodeSelection &&
          selection.node.type.name === "dateMention"
        ) {
          return false;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const { $from, $to } = view.state.selection;
          const rest = event.shiftKey ? null : view.state.doc.firstChild!.content.cut($to.parentOffset);
          if (rest && rest.size > 0) {
            view.dispatch(view.state.tr.delete($from.pos, $from.end()));
            const inline = rest.toJSON() as JSONContent[];
            // "Title| rest" carries "rest", not " rest", down.
            if (inline[0]?.type === "text") inline[0] = { ...inline[0], text: (inline[0].text ?? "").trimStart() };
            onExitRef.current(inline.filter((node) => node.type !== "text" || node.text));
          } else {
            onExitRef.current(null);
          }
          return true;
        }
        // Only from the last line: a wrapped title moves down through itself first.
        if (event.key === "ArrowDown" && !event.shiftKey && view.endOfTextblock("down")) {
          event.preventDefault();
          onExitRef.current(null);
          return true;
        }
        return false;
      },
      // A pasted line break would make a second paragraph a title can't hold, so a paste
      // goes in as one line, its "@YYYY-MM-DD" dates as dates.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (text === undefined) return false;
        event.preventDefault();
        const nodes = toInline(text.replace(/\s*\n\s*/g, " ")).map((node) => view.state.schema.nodeFromJSON(node));
        view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0)));
        return true;
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(serialize(editor.state.doc)),
  });

  const editorRef = useRef(editor);
  editorRef.current = editor;

  useImperativeHandle(
    ref,
    () => ({
      focusEnd: () => editorRef.current?.commands.focus("end"),
      setTitle: (next) => {
        const current = editorRef.current;
        if (!current || serialize(current.state.doc) === next) return;
        applyRemoteContent(current, toDoc(next));
      },
    }),
    []
  );

  // Until the editor exists (it only runs in the browser), the title as words, in place.
  if (!editor) {
    return (
      <div className={TITLE_CLASS} aria-hidden>
        {title ? titleText(title, null) : <span className="text-muted-foreground/60">Untitled</span>}
      </div>
    );
  }
  return <EditorContent editor={editor} />;
});

export default TitleEditor;
