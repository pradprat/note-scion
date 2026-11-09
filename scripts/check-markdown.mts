/**
 * Markdown round-trip checks for the page body <-> Markdown conversion that MCP uses
 * (src/lib/markdown.ts over the shared noteExtensions in src/lib/schema.ts).
 *
 *   bun scripts/check-markdown.mts                    run the checks
 *   bun scripts/check-markdown.mts --show             also print a sample database as Markdown
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
import { toAttrs } from "../src/lib/database";
import { createStableKeys } from "../src/app/_components/database/stable-keys";
import {
  parseNumberInput,
  addProperty,
  addRow,
  cleanName,
  deleteOption,
  deleteProperty,
  moveRow,
  normalizeDatabase,
  renameOption,
  renameProperty,
  setCell,
  type DatabaseData,
} from "../src/lib/database-model";

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

// 3. Databases.
const database = (data: unknown): JSONContent => ({ type: "database", attrs: toAttrs(normalizeDatabase(data)) });
const sample = {
  title: "Tasks `with` ``` backticks",
  properties: [
    { name: "Name", type: "title" },
    { name: "Notes", type: "text" },
    { name: "Status", type: "status", options: [{ name: "Not started", group: "todo" }, { name: "Doing", group: "doing" }, { name: "Done", group: "done" }] },
    { name: "Priority", type: "select", options: [{ name: "High" }, { name: "Low" }] },
    { name: "Due", type: "date" },
    { name: "Done?", type: "checkbox" },
    { name: "Cost", type: "number" },
  ],
  rows: [
    { id: "r1", cells: { Name: "Write the spec", Notes: "line one\nline two   \"quoted\" </details> ```", Status: "Doing", Priority: "High", Due: "2026-11-12", "Done?": true, Cost: 12.5 } },
    { id: "r2", cells: { Name: "Empty others" } },
    { id: "r3", cells: {} },
    { id: "r4", cells: { Name: "Zero cost", Cost: 0, Status: "Done" } },
  ],
  views: { active: "board", groupBy: "Status" },
};
const dbDoc = doc(para(text("before")), database(sample), para(text("after")));
const dbMd = toMarkdown(dbDoc, titleOf);
const dbBack = fromMarkdown(dbMd);
check("database: read_page then update_page (replace) gives the same document", same(dbBack, dbDoc), `${dbMd}\n---\n${JSON.stringify(dbBack)}\n---\n${JSON.stringify(dbDoc)}`);
check("database: Markdown is stable", toMarkdown(dbBack, titleOf) === dbMd);
check("database: fenced as note-database", dbMd.includes("\n```note-database\n{\n  \"title\":"));
if (process.argv.includes("--show")) console.log(dbMd.replace(/^/gm, "      | "));

check("database: normalizing twice changes nothing", same(normalizeDatabase(normalizeDatabase(sample)), normalizeDatabase(sample)));
const twoDbs = doc(database(sample), toggle(0, true, [text("T")], database({ title: "Inside a toggle", properties: [], rows: [{ cells: { Name: "x" } }] })));
const twoBack = fromMarkdown(toMarkdown(twoDbs));
check("database: two databases, one inside a toggle", twoBack.content?.[0]?.type === "database" && twoBack.content?.[1]?.content?.[1]?.type === "database" && same(twoBack.content?.[0], twoDbs.content?.[0]));

// Claude writes a database by hand, with names that aren't options yet and no ids.
const handWritten = fromMarkdown("```note-database\n{\"properties\":[{\"name\":\"Task\",\"type\":\"title\"},{\"name\":\"Stage\",\"type\":\"select\"}],\"rows\":[{\"cells\":{\"Task\":\"A\",\"Stage\":\"New\"}},{\"cells\":{\"Task\":\"B\",\"Stage\":\"New\",\"Nope\":\"dropped\"}}]}\n```");
const handDb = normalizeDatabase(handWritten.content?.[0]?.attrs);
check("database: hand-written JSON gets ids, options and a board", handDb.rows.length === 2 && handDb.rows.every((r) => r.id) && handDb.properties[1].options?.[0]?.name === "New" && handDb.views.groupBy === "Stage" && !("Nope" in handDb.rows[1].cells));
const broken = fromMarkdown("```note-database\n{ not json\n```\n\nafter");
check("database: JSON that doesn't parse stays a code block", broken.content?.[0]?.type === "codeBlock" && broken.content[0].attrs?.language === "note-database" && broken.content[0].content?.[0]?.text === "{ not json");
check("database: a lookalike fence with other info is untouched", fromMarkdown("```json\n{\"a\":1}\n```").content?.[0]?.type === "codeBlock");

// Append never touches a database; neither does editing the text around it.
const withDb = doc(para(text("intro")), database(sample));
const appendedDb = appendContent(withDb, fromMarkdown("## New section\n\nMore"));
check("database: append mode leaves the database untouched", same(appendedDb.content?.[1], withDb.content?.[1]) && appendedDb.content?.length === 4);
const edited = fromMarkdown(toMarkdown(withDb, titleOf).replace("intro", "rewritten intro"));
check("database: rewriting the text around it keeps the database", same(edited.content?.[1], withDb.content?.[1]));

// The model's own operations stay normalized (what the editor writes is what reads back).
const start = normalizeDatabase(sample);
const ops: Array<[string, DatabaseData]> = [
  ["add row", addRow(start, { Name: "n" }).db],
  ["set cell", setCell(start, "r1", "Cost", 3)],
  ["clear cell", setCell(start, "r1", "Cost", null)],
  ["new select value becomes an option", setCell(start, "r1", "Priority", "Medium")],
  ["rename property", renameProperty(start, "Due", "Deadline")],
  ["rename option", renameOption(start, "Status", "Doing", "In progress")],
  ["delete option", deleteOption(start, "Status", "Done")],
  ["delete property", deleteProperty(start, "Notes")],
  ["delete group-by property", deleteProperty(start, "Status")],
  ["add property", addProperty(start, "select", "Area").db],
  ["move card", moveRow(start, "r3", "Status", "Done", "r4")],
  ["move card to the end of a column", moveRow(start, "r2", "Status", "Done")],
  ["move card to no value", moveRow(start, "r1", "Status", null)],
];
for (const [name, result] of ops) {
  check(`database op: ${name} is already normal`, same(normalizeDatabase(result), result));
  const md = toMarkdown(doc(database(result)), titleOf);
  check(`database op: ${name} round-trips`, same(fromMarkdown(md).content?.[0]?.attrs, toAttrs(result)));
}
check("database op: renaming a property renames its cells and group-by", (() => { const r = renameProperty(start, "Status", "Stage"); return r.views.groupBy === "Stage" && r.rows[0].cells.Stage === "Doing" && !("Status" in r.rows[0].cells); })());
check("database op: deleting an option empties its cells", !("Status" in deleteOption(start, "Status", "Done").rows[3].cells));
check("database op: the title can't be deleted", same(deleteProperty(start, "Name"), start));
check("database op: reserved names are made safe", addProperty(start, "text", "__proto__").name === "__proto___" && cleanName("constructor", "x") === "constructor_");
check("database op: a card moved before another lands there", moveRow(start, "r3", "Status", "Done", "r4").rows.map((r) => r.id).join() === "r1,r2,r3,r4");
check("database op: a card moved into a column goes after its last card", moveRow(start, "r2", "Status", "Done").rows.map((r) => r.id).join() === "r1,r3,r4,r2");
check("database: a status gets a group, a select doesn't", start.properties[2].options?.every((o) => o.group) === true && start.properties[3].options?.every((o) => !("group" in o)) === true);
const wild = normalizeDatabase({ properties: [{ name: "A", type: "title" }, { name: "A", type: "title" }, { name: "A", type: "nonsense" }, { name: "__proto__", type: "text" }], rows: [{ id: "x", cells: { A: 5, "__proto__": "p" } }, { id: "x", cells: {} }], views: { active: "kanban", groupBy: "A" } });
check("database: duplicate and reserved names, repeated ids and a bad view are repaired", wild.properties.map((p) => p.name).join() === "A,A 2,A 3,__proto___" && wild.rows[0].cells.A === "5" && new Set(wild.rows.map((r) => r.id)).size === 2 && wild.views.active === "table" && wild.views.groupBy === undefined);
check("database: nothing at all becomes an empty database", same(normalizeDatabase(null), { title: "", properties: [{ name: "Name", type: "title" }], rows: [], views: { active: "table" } }));

// Bug fix: deleting a property must not hand its open menu to the next column.
{
  const keys = createStableKeys();
  const before = ["Name", "Status", "Date", "Effort"].map((n) => keys.keyOf(n));
  // "Date" is deleted: the columns are asked for again without it.
  const after = ["Name", "Status", "Effort"].map((n) => keys.keyOf(n));
  check("keys: deleting a property leaves the other columns' keys alone", after[0] === before[0] && after[1] === before[1] && after[2] === before[3]);
  check("keys: the column after a deleted one does not take its key", after[2] !== before[2]);
  keys.renamed("Effort", "Hours");
  check("keys: a rename keeps the column's key", keys.keyOf("Hours") === before[3]);
  check("keys: a name added later gets a new key", keys.keyOf("Effort") !== before[3] && keys.keyOf("Effort") !== keys.keyOf("Hours"));
  check("keys: all keys are distinct", new Set(["Name", "Status", "Hours", "Effort"].map((n) => keys.keyOf(n))).size === 4);
}

// Bug fix: a typo in a number field must never read as "clear the number".
{
  const kind = (text: string) => parseNumberInput(text).kind;
  const value = (text: string) => { const r = parseNumberInput(text); return r.kind === "valid" ? r.value : undefined; };
  check("number input: '12' is 12", value("12") === 12);
  check("number input: '12x' is invalid, not empty", kind("12x") === "invalid");
  check("number input: 'x' is invalid", kind("x") === "invalid");
  check("number input: empty and blank text clear", kind("") === "empty" && kind("   ") === "empty");
  check("number input: signs, decimals and exponents are numbers", value("-3.5") === -3.5 && value("+2") === 2 && value(".5") === 0.5 && value("1.") === 1 && value("1e3") === 1000 && value(" 7 ") === 7);
  check("number input: zero is a number, not empty", value("0") === 0 && kind("0") === "valid");
  check("number input: '-', '.', '1e' are invalid while typing", kind("-") === "invalid" && kind(".") === "invalid" && kind("1e") === "invalid");
  check("number input: hex, Infinity and overflow are invalid", kind("0x10") === "invalid" && kind("Infinity") === "invalid" && kind("1e999") === "invalid" && kind("1,5") === "invalid");
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
