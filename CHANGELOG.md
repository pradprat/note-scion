# Changelog

All notable changes to note-scion are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The sidebar resizes. Drag its right edge to anywhere from 208 to 480px wide, and
  double-click the edge to go back to 256px. From the keyboard, focus the edge and use
  the arrow keys, Home and End, or Enter to reset. The width is kept in a
  `sidebar_width` cookie, so it renders at that width on load.
- Clicking a block's grip opens "Turn into": the block types from the `/` menu, with a
  check on the current one. Pick one, or type to narrow the list and press Enter, to make
  a line a heading, a list or to-do item, a toggle or toggle heading, a quote or code,
  keeping its text. A list item changes on its own, a toggle's inside follows its line
  out, and Ctrl or ⌘ Z undoes it in one step. Tables, databases, sub-pages and dividers
  are still only selected by the click.
- The browser tab names the open page: "Notes | Standup Today". It follows the title as
  you type it, and the trash and connected apps read "Notes | Trash" and
  "Notes | Connected apps".

- Pictures. Paste an image (a screenshot, or "Copy image" from a browser) or drop an image
  file on a page and it is added as its own block, with an empty line after it when it ends
  the page. PNG, JPEG, WebP and GIF; one over 1600px on its longest side is shrunk to that
  before it is sent, and one that is still over 4 MB is refused. Text on the clipboard
  with the image (a spreadsheet cell, a Word paragraph) pastes as text instead. Pictures
  are kept in a new `notes_images` table (the build adds it) and shown only to a signed-in
  browser. A picture nothing refers to any more is cleared a day after it was added. Over
  MCP a picture is a line `![description](/api/images/<id>)` that Claude reads and writes
  back unchanged. Two new MCP tools, `read_image` (returns the picture itself) and
  `add_image` (base64 data and a page id; the picture is added to the end of the page),
  let Claude see and add pictures; `add_image` takes PNG, JPEG, WebP and GIF up to 3 MB and
  doesn't resize. The demo keeps pictures in the page itself,
  shrunk to 1000px and about 300 KB.

### Changed

- The page icon picker offers about 350 emoji instead of 48, in groups (notes and work,
  ideas and status, tech, home, travel, nature, food, activities, people and symbols),
  with a search field at the top. Typing shows the matches as one grid, best first
  ("heart" leads with ❤️; "blue heart" and "food" work too), Enter picks the first, and
  the arrow keys move from the field into the grid.
  On a touchscreen the field waits for a tap, so the keyboard doesn't cover the grid.
- Toggles fold open and closed instead of snapping: the blocks inside grow out of the
  summary and fold back into it, with the same timing as sub-pages in the sidebar. The
  `/`, `@` and Turn into menus fade in with a slight drift away from their line. With
  reduced motion turned on, toggles only fade in and menus only fade.

### Fixed

- A board wider than the page fades out at its right edge while more columns lie beyond
  it, and the fade goes when you reach the last one.
- The demo's footer note and the Ctrl K hint in the sidebar are a little darker and larger.
- The login page names the app and says what it is, with its form sitting a little above centre.
- On a narrow screen the breadcrumb keeps room for the open page's name and gives the
  ancestor page less, instead of squeezing both.
- A database's long names and text now end in an ellipsis where they don't fit, instead of
  being cut off in the middle of a letter. Click a cell to read all of it, or open the row.
- Moving the cursor up a long page (arrow keys, or typing at its end) no longer leaves the
  line you're on hidden under the top bar. The page now scrolls to keep it clear of the
  bar, and off the bottom edge.
- Clicking into a page that was written in Markdown (by Claude over MCP, or the demo's
  sample pages) no longer counts as an edit. The save status said "Editing" and the
  page was saved again unchanged, which could also turn a later edit from Claude into a
  conflict. The check now compares the page as the editor holds it, with its default
  attributes and key order.
- Clicking a sub-page link inside a page no longer throws an error in the editor ("Selection
  passed to setSelection must point at the current document") as the page opens.
- Scrolling the icon picker no longer lags. Over a transparent background at 1x zoom,
  Chrome scrolled the grid by repainting it, so all ~350 colour emoji were drawn again
  on every wheel tick. The grid now has the popover's own opaque background, so it is
  drawn once when the picker opens and then scrolls on the compositor.
- On a touchscreen, to-do checkboxes, the toggle arrow, the date "Clear" button and sub-page
  link rows are now at least 40px to tap (the checkbox is 20px with an invisible area around
  it, so lines don't get taller). They were 16px, 24px, 24px and 29px.
- The login page has a show/hide button on the password field, and no longer focuses the
  field on a phone, where that raised the keyboard before you'd seen the page.
- Placeholder text is easier to read: a table's empty cells at full muted colour, and the
  "Untitled" page title at 75% instead of 60% opacity.
- A page loads about 48 kB less JavaScript (420 to 372 kB first load on a page, 425 to 377
  on the demo). The block grip's library pulled in Yjs, which note-scion doesn't use, and
  the Mod+K switcher and its command-palette library now load the first time you open it.
- The database views (table, board, row dialog and menus) load the first time a page with
  a database opens, so pages without one carry about 8 kB less (372 to 364 kB).
- The database views' hover transitions run at their intended 120ms; Tailwind had been
  dropping `duration-[120ms]` as ambiguous.
- A hung `/api/mcp` call now fails after 30 seconds instead of the platform's 300, so one
  stuck request can't hold a function open for five minutes.

## [1.1.0] - 2026-11-09

### Added

- Databases. Type `/database` for a block of rows with typed properties (title, text, select,
  status, date, checkbox and number), shown as a Table or a Board with tabs on the block. The
  table edits cells in place; the board groups the rows by a select or status property, and a
  card moves by dragging or by its "Move to" menu. Open a row for all of it, and add,
  rename or delete properties and their options from a column's header. A database lives
  in the page itself, so it needs no new tables, and saves and undoes like the rest of the
  page. Over MCP it is a fenced `note-database` block of JSON that reads and writes back
  unchanged, and appending to a page never touches it.
- Toggles. Type `/toggle` for a toggle list or a toggle heading 1 to 3, or `>` and a space
  at the start of a line (`#`, `##` or `###` and then `>` for a heading). "Turn into" in
  the `/` menu makes a line you've already written into one. The arrow, or Ctrl or ⌘
  Enter, opens and closes a toggle, and whether it is open is saved with the page. Any
  block can go inside, including more toggles. Over MCP a toggle is HTML,
  `<details open><summary>Title</summary>`, with the blocks inside it as Markdown.
- After an MCP client edits a page, its save status says which app made the change and
  how long ago ("Claude Code edited 4m ago"), until you edit the page again. Stored in
  two new columns, `notes_pages.mcp_editor` and `mcp_edited_at`, which the build adds.
- The demo's "Working with Claude" page can simulate an edit from Claude: after a short
  countdown, a to-do lands on the page as an MCP edit would, with the save status naming
  Claude, or the conflict bar if you're still typing. The welcome page points to it and
  now ends on deploying your own copy.
- The demo has a "Deploy your own" link in its top bar, on phones too. It and the "Your
  own copy" sample page both go to the README's Deploy section.
- Tables. Type `/table` for a 3×3 table with a header row; a toolbar above it adds and
  removes rows and columns, and the whole table moves by its grip. Tables read and write
  as GitHub-flavoured Markdown tables over MCP.
- In a conflict, "Show the newer version" opens the stored copy as Markdown, so you can
  see what you'd keep or replace before choosing.
- Pages move in the sidebar from the keyboard: with a page focused, Alt+Shift+Up and Down
  move it past its neighbours, Alt+Shift+Right nests it inside the page above, and
  Alt+Shift+Left moves it out of its parent.
- After a restore, the trash shows "Restored "…". Open it", with a link to the page.
- Click an `@` date, in a page or its title, to change it from a calendar. Enter on a
  selected date opens it too; arrow keys move by day and week, Page Up and Page Down by
  month. The new day is stored, so Claude reads it over MCP.

### Changed

- `>` and a space now starts a toggle instead of a quote. A quote is `"` and a space, and
  stays in the `/` menu. A straight double quote at the start of a line followed by a space
  now turns the line into a quote block as you type; Ctrl+Z puts the characters back.
- The sidebar moves with more care. Hiding and showing it slides and settles (260ms in,
  180ms out) instead of a linear 200ms, and its contents fade as it goes. Opening a page
  in the tree grows its sub-pages out of the row, and closing it folds them back. Rows
  change color on hover over 120ms, and the sidebar on phones opens in 300ms rather than
  500ms. With reduced motion, nothing slides or grows; the phone sidebar and sub-pages
  fade instead.
- The demo is called note-scion in its sidebar and browser tab, and its Demo badge is
  larger. The footer's "Deploy your own" and the Copy link button are gone from the demo.
- The demo's copy only says what's true there: its trash doesn't mention Claude, and
  says Reset demo clears it. On phones and tablets, the sample pages say tap, Search and +
  instead of Ctrl K, hover and drag.
- The conflict bar says the page changed "in another tab or by Claude" rather than
  "probably by Claude".
- The page tree is one stop in the tab order, with arrow keys to move, open and close
  pages, and each page link says whether it's expanded. A "Skip to page" link goes
  straight to the page title.
- In the trash, Restore buttons name their page, focus moves to the next page after a
  restore or delete, and a screen reader hears what happened. Cancelling a confirm
  returns focus to the button that opened it.
- The red of destructive buttons and error text is darker in light mode (#DC2626), and
  red buttons in dark mode use dark text, so both read at 4.5:1 or more.
- Sidebar titles use the whole row. With a mouse, a page's trash and + appear over the
  end of its title on hover; on touch screens they're one 40px "⋯" menu.
- On phones, the top bar keeps room for the page's name; a long save status shortens
  first.
- The quick switcher stays in place as you type instead of re-centring, and a match in
  a page's text shows the words around it.
- The demo's empty state can bring back the sample pages.
- `@` dates work in page titles as they do in the body: "@today" in a title reads
  Today, then Yesterday, then its full date, in the title, the sidebar, breadcrumbs, the
  quick switcher and sub-page links. Titles store the date as `@YYYY-MM-DD`, which
  Claude can read and write over MCP.
- Screen readers read an `@` date as "Tomorrow", not "at Tomorrow".
- An `@` date more than a day away shows its full date, "November 8, 2026", instead of
  "Nov 8". Yesterday, today and tomorrow still read as words.
- The conflict bar's choices are "Keep my version" and "Keep the newer version", neither
  styled as the default, and it says the version you keep replaces the other.
- The demo's welcome page leads with what note-scion does and links straight to Working
  with Claude. The Claude page is shorter, so its simulate button is in view on a laptop,
  and the sample deploy page is called "Your own copy".
- Links in a page's text are underlined in the secondary ink instead of the hairline
  color, so they can be seen.
- Below 640px the save status reads "Claude edited" without the time, so the page name
  keeps its room.
- The page column keeps its scrollbar's room on short pages, so it no longer shifts
  sideways between pages, and toasts centre on the page column, not the window.
- The empty state reads "Your workspace is empty". To-do checkboxes are named by their
  text for screen readers.

### Fixed

- A date in a database can be cleared on a phone or tablet: the clear button, which only
  showed on hover, is now always visible on screens without hover.
- An authenticated `GET /api/mcp` now gets `405 Method Not Allowed` at once. Before, it
  opened a notification stream that nothing ever wrote to, and held the function open
  until Vercel's 300-second timeout. `POST` and `DELETE` work as before, and a request
  without a token still gets `401`.
- The `/` and `@` menus no longer cover the line being typed or run off the bottom of the
  screen. They open above the line when there's more room there, including above a
  phone's keyboard.
- A long save status no longer overlaps the breadcrumb of a top-level page on phones.
- A page restored in the trash and deleted again while the trash was open now shows up
  there again.
- Resetting the demo from its empty state no longer leaves a blank page.
- The "Type '/' for commands" hint no longer shows on a new page while you're typing its
  title.
- The MCP tools now say that a page created inside another isn't linked from the parent's
  body, and that an `@` date never links to a page, so Claude adds a real sub-page link
  instead of a date.
- When Claude's edit lands on a page you have open, your cursor stays where it was.
  Before, it jumped to the end of the new text, so what you typed next went into
  Claude's words.
- Opening a page that ends in a list no longer counts as an edit. It cost a needless
  save, and if Claude's edit arrived then it showed as a conflict nobody caused.
- In the demo, typing anything during the simulated edit's countdown makes a conflict;
  before, only typing in its last moment did. Repeated simulated edits add different
  to-dos.
- Enter in the quick switcher opens a page found by its text instead of making a new
  page named after the search.
- Claude adding to the end of a page (`update_page` in append mode) no longer overwrites a
  save you make at that moment. It reads the page again and adds to what you saved, and
  after three tries in a row it stops with an error and writes nothing, telling Claude to
  read the page and retry.

## [1.0.0] - 2026-11-06

The first public release.

### Added

- Block editor with headings, lists, to-dos, quotes, code blocks and dividers, a `/` menu,
  Markdown shortcuts and drag handles.
- Nested pages with a drag-and-drop page tree and sub-page blocks.
- `@` dates that read as relative dates (Today, Tomorrow, Nov 12).
- Quick switcher (`Ctrl K` / `⌘ K`) with title and full-text search.
- Autosave with conflict detection, so edits from the app and from MCP never silently
  overwrite each other.
- Trash with 30-day retention and undo.
- A public demo at `/demo` that runs the whole workspace in the browser, with pages kept
  in localStorage and no login. All its routes are static files.
- Guards that keep strangers from using up free-tier limits: token and client id shape
  checks before any database query, and a capped, self-cleaning client registration.
- Remote MCP server with seven tools, and an OAuth 2.1 authorization server with dynamic
  client registration, PKCE and refresh-token rotation.
- Server-side page caching and prefetch on hover.
- Light and dark themes.
- One-click deploy to Vercel with Neon; the build creates the tables.

[Unreleased]: https://github.com/pradprat/note-scion/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/pradprat/note-scion/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/pradprat/note-scion/releases/tag/v1.0.0
