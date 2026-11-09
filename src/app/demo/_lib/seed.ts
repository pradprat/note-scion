import { fromMarkdown } from "@/lib/markdown";
import { toISODate } from "@/lib/dates";
import { databaseJson } from "@/lib/database";
import { normalizeDatabase } from "@/lib/database-model";
import { DEPLOY_URL } from "@/lib/links";
import type { NotePage } from "@/lib/types";

type Sample = Omit<NotePage, "updatedAt" | "mcpEdit">;

/** A day this many days from today, as a database's date cell stores it. */
function isoDay(offset: number): string {
  return day(offset).slice(1);
}

/** The sample database, as the fenced block Claude would write for it (see src/lib/database.ts). */
function sampleDatabase(): string {
  const database = normalizeDatabase({
    title: "Launch tasks",
    properties: [
      { name: "Name", type: "title" },
      {
        name: "Status",
        type: "status",
        options: [
          { name: "Not started", group: "todo" },
          { name: "In progress", group: "doing" },
          { name: "Done", group: "done" },
        ],
      },
      { name: "Priority", type: "select", options: [{ name: "High" }, { name: "Medium" }, { name: "Low" }] },
      { name: "Due", type: "date" },
    ],
    rows: [
      { id: "demo-1", cells: { Name: "Write the launch post", Status: "In progress", Priority: "High", Due: isoDay(2) } },
      { id: "demo-2", cells: { Name: "Review the open pull requests", Status: "Not started", Priority: "Medium", Due: isoDay(1) } },
      { id: "demo-3", cells: { Name: "Plan the demo walkthrough", Status: "Not started", Priority: "Low", Due: isoDay(9) } },
      { id: "demo-4", cells: { Name: "Fix the login redirect", Status: "Done", Priority: "High", Due: isoDay(-1) } },
      { id: "demo-5", cells: { Name: "Update the README", Status: "Done", Priority: "Medium" } },
      { id: "demo-6", cells: { Name: "Collect feedback", Status: "In progress", Priority: "Medium", Due: isoDay(5) } },
    ],
    views: { active: "table", groupBy: "Status" },
  });
  return "```note-database\n" + databaseJson(database) + "\n```";
}

/** A date this many days from today, as the editor's date chip writes it. */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `@${toISODate(date)}`;
}

/**
 * The workspace a first visit to the demo opens on. Written in Markdown, the same way
 * Claude writes pages over MCP; sub-page blocks are `[Title](/<id>)` lines.
 *
 * `touch` writes the instructions for a phone or tablet, which has no hover, drag
 * handles or Ctrl K: tap, the Search row and the + buttons instead.
 */
export function samplePages(touch = false): { pages: Sample[]; claudePageId: string } {
  const id = {
    welcome: crypto.randomUUID(),
    blocks: crypto.randomUUID(),
    dates: crypto.randomUUID(),
    tasks: crypto.randomUUID(),
    claude: crypto.randomUUID(),
    trip: crypto.randomUUID(),
    packing: crypto.randomUUID(),
    reading: crypto.randomUUID(),
    deploy: crypto.randomUUID(),
  };

  const page = (
    key: keyof typeof id,
    parent: keyof typeof id | null,
    position: number,
    icon: string,
    title: string,
    markdown: string
  ): Sample => ({
    id: id[key],
    parentId: parent ? id[parent] : null,
    position,
    icon,
    title,
    content: fromMarkdown(markdown.trim()),
  });

  const pages = [
    page(
      "welcome",
      null,
      1,
      "👋",
      "Welcome to note-scion",
      `
note-scion is a calm notes app for one person, with nested pages and a block editor. Your own copy also comes with an MCP server, so Claude can read and write the same pages. See it happen here:

[Working with Claude](/${id.claude})

This is a live demo. It runs entirely in your browser: what you write here is saved in this browser only, and nothing is sent anywhere.

## Try it

- [ ] ${touch ? "Tap" : "Click"} anywhere on this page and start typing. It saves as you go.
- [ ] Open **Working with Claude**, above, and simulate an edit from Claude.
- [ ] On an empty line, type \`/\` for headings, lists, to-dos, quotes and code.
- [ ] ${touch ? "Tap **Search** in the sidebar" : "Press Ctrl K (⌘ K on a Mac)"} to jump to any page or search inside them.
- [ ] Type \`@\` and then "tomorrow" or "next friday" to drop in a date.
- [ ] ${touch ? "Tap ⋯ next to a page in the sidebar, then **Add a page inside**." : "Nest a page by dragging it onto another in the sidebar, or with Alt Shift →."}
- [ ] Delete a page, then bring it back from the Trash.

## Inside this page

[Writing in blocks](/${id.blocks})

[Dates that stay true](/${id.dates})

[Tracking tasks](/${id.tasks})

**Reset demo** at the bottom of the sidebar puts the sample pages back at any time.

## Your own copy

Your own copy keeps your pages in your own database, where Claude can read and write them too.

[Your own copy](/${id.deploy})
`
    ),
    page(
      "blocks",
      "welcome",
      1,
      "✍️",
      "Writing in blocks",
      `
${touch ? "Every line is a block. On a computer, you can drag one to a new place by the handle on its left." : "Every line is a block. Hover one and drag the handle on its left to move it."}

## Markdown shortcuts

Type these at the start of a line:

- \`#\`, \`##\` or \`###\` and a space for a heading
- \`-\` or \`*\` for a bullet list, \`1.\` for a numbered one
- \`[]\` for a to-do
- \`>\` for a toggle, or \`#\`, \`##\` or \`###\` and then \`>\` for a toggle heading
- \`"\` for a quote
- \`\`\`\` \`\`\` \`\`\`\` for a code block
- \`---\` for a divider

Inline, wrap text in \`**\` for **bold**, \`*\` for *italic* and backticks for \`code\`. Select text and ${touch ? "tap **Link**" : "press Ctrl K"} to add a [link](https://github.com/pradprat/note-scion).

> A page can hold other pages. Type \`/page\` to start one right here.

## Toggles

<details open><summary>A toggle hides what's inside</summary>

${touch ? "Tap the arrow" : "Click the arrow, or press Ctrl Enter (⌘ Enter on a Mac)"} to close it. Whether it is open is saved with the page. Any block can go inside, including another toggle.

<details><summary>Toggles nest</summary>

This one starts closed.

</details>

</details>

<details open><summary>## A toggle heading</summary>

Type \`/toggle\` for the four kinds, or turn a line you've already written into one.

</details>

\`\`\`ts
// Code blocks keep their indentation. Tab indents inside them.
function greet(name: string) {
  return \`Hello, \${name}\`;
}
\`\`\`
`
    ),
    page(
      "dates",
      "welcome",
      2,
      "📅",
      "Dates that stay true",
      `
Dates read the way you'd say them, and stay right as the days pass. Something written as "tomorrow" today still shows the correct day next week.

- Dentist ${day(1)}
- Send the draft ${day(3)}
- Quarterly review ${day(14)}
- Started this list ${day(-2)}

Type \`@\` followed by **today**, **tomorrow**, **next monday**, **in 3 days** or a date like **march 4**. Dates work in titles too.
`
    ),
    page(
      "tasks",
      "welcome",
      3,
      "✅",
      "Tracking tasks",
      `
A database is a block of rows with typed properties. Type \`/database\` to add one. This one shows the same rows two ways: switch between **Table** and **Board** with the tabs. ${touch ? "On the board, the arrows on a card move it to another column." : "On the board, drag a card to another column, or use the arrows on the card."}

${sampleDatabase()}

Add a property with the + at the end of the header, and open a row to see all of it. Select and status properties keep their own options: click a column's name to rename, add or reorder them. Claude reads and writes a database as one block of JSON, so you can ask it to add a row or move tasks along.
`
    ),
    page(
      "claude",
      null,
      2,
      "🤖",
      "Working with Claude",
      `
In your own copy, Claude connects to note-scion over MCP. Add \`https://<your-site>/api/mcp\` as a custom connector on claude.ai, or in Claude Code, and approve the connection on your site.

Claude can list, search and read your pages as Markdown, create pages (inside other pages too), change a title, an icon or the body, move pages around the tree, and send pages to the trash, where you can restore them.

## Things to ask

- "What's on my reading list?"
- "Turn these meeting notes into a page under Projects, with to-dos for each owner."

When Claude changes a page you have open, the new text appears in place, and the status at the top of the page says which app made the edit and when. If you were typing at that moment, you choose which version to keep, so nothing is silently overwritten.
`
    ),
    page(
      "trip",
      null,
      3,
      "🏔️",
      "Weekend trip",
      `
Two nights up north, leaving ${day(10)}.

## Plan

- [x] Book the cabin
- [ ] Check the trail conditions
- [ ] Pick up the rental car ${day(9)}

## Ideas

- Sunrise hike on the first morning
- The bakery everyone mentions, by the lake

[Packing list](/${id.packing})
`
    ),
    page(
      "packing",
      "trip",
      1,
      "🎒",
      "Packing list",
      `
- [ ] Rain jacket
- [ ] Headlamp
- [x] Boots
- [ ] Charger and power bank
- [ ] Snacks for the drive
`
    ),
    page(
      "reading",
      null,
      4,
      "📚",
      "Reading list",
      `
- [ ] The Design of Everyday Things
- [ ] A Philosophy of Software Design
- [x] Thinking, Fast and Slow
- [ ] The Pragmatic Programmer
`
    ),
    page(
      "deploy",
      null,
      5,
      "🚀",
      "Your own copy",
      `
note-scion is open source under the MIT license. Your own copy keeps your pages in your own Postgres database, behind your password.

1. Open [the deploy steps](${DEPLOY_URL}) on GitHub and click **Deploy with Vercel**. It copies the code and adds a free Neon database.
2. Choose a password and a session secret when asked.
3. Open your site, log in, and connect Claude.

The free tiers of Vercel and Neon are plenty for one person.
`
    ),
  ];
  return { pages, claudePageId: id.claude };
}
