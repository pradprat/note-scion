/**
 * Markdown round-trip checks for the page body <-> Markdown conversion that MCP uses
 * (src/lib/markdown.ts over the shared noteExtensions in src/lib/schema.ts).
 *
 *   bun scripts/check-markdown.mts                    run the checks
 *   bun scripts/check-markdown.mts --update-baseline  rewrite the stored baseline
 *
 * The baseline (scripts/fixtures/markdown-existing.baseline.json) is what `main` produced
 * for scripts/fixtures/markdown-existing.md before toggles and databases existed. Only
 * regenerate it from a checkout where the conversion of those older node types is meant
 * to change; otherwise a diff here means existing pages would serialize differently.
 * It touches no database and reads no environment variables.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JSONContent } from "@tiptap/core";
import { appendContent, fromMarkdown, toMarkdown } from "../src/lib/markdown";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, "fixtures", "markdown-existing.md"), "utf8");
const baselinePath = join(here, "fixtures", "markdown-existing.baseline.json");

const titleOf = (id: string) => (id.startsWith("0b9c6f5e") ? "Sub-page" : undefined);

function existingOutput() {
  const parsed = fromMarkdown(fixture);
  return { parsed, serialized: toMarkdown(parsed, titleOf) };
}

if (process.argv.includes("--update-baseline")) {
  writeFileSync(baselinePath, JSON.stringify(existingOutput(), null, 2) + "\n");
  console.log("baseline written");
  process.exit(0);
}

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`ok    ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `\n${detail}` : ""}`);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// 1. Existing node types parse and serialize exactly as before.
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const now = existingOutput();
check("existing types: parsed JSON equals baseline", same(now.parsed, baseline.parsed));
check(
  "existing types: Markdown equals baseline",
  now.serialized === baseline.serialized,
  `--- baseline\n${baseline.serialized}\n--- now\n${now.serialized}`
);
// And the baseline output is stable when read again.
check("existing types: serialize(parse(serialized)) is stable", toMarkdown(fromMarkdown(now.serialized), titleOf) === now.serialized);

// 2. Toggles.
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const text = (value: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text: value, ...(marks && { marks }) });
const para = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", ...(content.length && { content }) });
const toggle = (level: number, open: boolean, summary: JSONContent[], ...body: JSONContent[]): JSONContent => ({
  type: "toggle",
  attrs: { level, open },
  content: [{ type: "toggleSummary", ...(summary.length && { content: summary }) }, ...(body.length ? body : [para()])],
});
const roundTrips = (name: string, original: JSONContent) => {
  const md = toMarkdown(original, titleOf);
  const back = fromMarkdown(md);
  check(`toggle: ${name}`, same(back, original), `--- markdown
${md}
--- back
${JSON.stringify(back)}
--- original
${JSON.stringify(original)}`);
  check(`toggle: ${name} is stable`, toMarkdown(back, titleOf) === md);
};

roundTrips("plain, open, one paragraph", doc(toggle(0, true, [text("Title")], para(text("body")))));
roundTrips("plain, closed", doc(toggle(0, false, [text("Closed")], para(text("hidden")))));
roundTrips("heading levels 1 to 3", doc(
  toggle(1, true, [text("One")], para(text("a"))),
  toggle(2, false, [text("Two")], para(text("b"))),
  toggle(3, true, [text("Three")], para(text("c")))
));
roundTrips("empty summary and empty body", doc(toggle(0, false, [])));
roundTrips("marks in the summary", doc(toggle(2, true, [text("Bold", [{ type: "bold" }]), text(" and "), text("code", [{ type: "code" }])], para(text("x")))));
roundTrips("summary starting with #", doc(toggle(0, true, [text("# not a heading")], para(text("x")))));
roundTrips("summary with </summary> and angle brackets", doc(toggle(0, true, [text("a < b </summary> c")], para(text("x")))));
roundTrips("body of many block types", doc(toggle(0, true, [text("Mixed")],
  { type: "heading", attrs: { level: 2 }, content: [text("Inner heading")] },
  para(text("para")),
  { type: "bulletList", content: [{ type: "listItem", content: [para(text("a"))] }, { type: "listItem", content: [para(text("b"))] }] },
  { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [para(text("done"))] }] },
  { type: "blockquote", content: [para(text("quoted"))] },
  { type: "codeBlock", attrs: { language: "html" }, content: [text("<details>\n</details>")] },
  { type: "horizontalRule" },
  { type: "pageLink", attrs: { id: "0b9c6f5e-1a2b-4c3d-8e4f-5a6b7c8d9e0f" } }
)));
roundTrips("nested toggles", doc(
  toggle(1, true, [text("Outer")], para(text("before")), toggle(0, false, [text("Inner")], para(text("inner body")), toggle(3, true, [text("Deepest")], para(text("deep")))), para(text("after")))
));
roundTrips("toggle between other blocks", doc(para(text("above")), toggle(0, true, [text("T")], para(text("b"))), para(text("below"))));
roundTrips("toggle inside a quote", doc({ type: "blockquote", content: [toggle(0, true, [text("Q")], para(text("b")))] }));
roundTrips("toggle inside a list item", doc({ type: "bulletList", content: [{ type: "listItem", content: [para(text("item")), toggle(0, true, [text("T")], para(text("b")))] }] }));
roundTrips("table inside a toggle", doc(toggle(0, true, [text("Data")], {
  type: "table", content: [
    { type: "tableRow", content: [{ type: "tableHeader", content: [para(text("A"))] }] },
    { type: "tableRow", content: [{ type: "tableCell", content: [para(text("1"))] }] },
  ],
})));

// What Claude would naturally write.
const hand = fromMarkdown("<details>\n<summary>Plain</summary>\n\nText.\n\n</details>\n\nAfter.");
check("toggle: hand-written <details> without attributes parses closed", same(hand, doc(toggle(0, false, [text("Plain")], para(text("Text."))), para(text("After.")))));
const hand2 = fromMarkdown("<details open>\n<summary>## Section</summary>\n\n- one\n- two\n\n</details>");
check("toggle: hand-written heading toggle", hand2.content?.[0]?.attrs?.level === 2 && hand2.content[0].attrs.open === true);
const noBlank = fromMarkdown("<details><summary>Tight</summary>\nbody right under\n</details>");
check("toggle: no blank lines still parses", noBlank.content?.[0]?.type === "toggle" && noBlank.content.length === 1);
const unclosed = fromMarkdown("<details><summary>Never closed</summary>\n\nbody");
check("toggle: an unclosed <details> doesn't throw", Array.isArray(unclosed.content));
const fenced = fromMarkdown("<details><summary>Code</summary>\n\n```html\n</details>\n```\n\n</details>\n\nTail");
check("toggle: </details> inside a fenced code block doesn't close it", fenced.content?.length === 2 && fenced.content[0].content?.[1]?.type === "codeBlock");

// A page with toggles keeps an appended section out of them.
const base = doc(toggle(0, true, [text("T")], para(text("b"))));
const appended = appendContent(base, fromMarkdown("More"));
check("toggle: append leaves the toggle untouched", same(appended.content?.[0], base.content?.[0]) && appended.content?.length === 2);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
