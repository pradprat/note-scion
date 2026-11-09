# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Self-hosting Claude users: mostly developers who work with Claude every day and want a
private place for notes that Claude can read and write too. They come to the project
through GitHub or the live demo at `/demo`, try the workspace in the browser, and then
deploy their own copy on Vercel and Neon.

After that, each deployment has one user, the person who deployed it. Their jobs are to
write and organise notes in a block editor, find things quickly, and let Claude look up,
draft and update the same pages from claude.ai, Claude Code or any other MCP client.

## Product Purpose

note-scion is a calm, fast writing space for one person with an MCP server built in, so
the notes you keep are also notes your assistant can work with. Success means the owner
keeps their real notes here and Claude edits them alongside the owner without anything
being lost. A second measure is that people who try the demo go on to deploy their own
copy.

## Positioning

Four things together set it apart from Notion with its MCP connector, Obsidian with an
MCP plugin, or plain Markdown files:

- **Private and self-hosted.** Notes live in the owner's own Postgres database. No vendor
  holds the workspace.
- **Shared with Claude.** The owner and Claude edit the same pages. Autosave checks for
  conflicts, so an edit from the app and an edit over MCP never silently overwrite each
  other; the owner chooses which version to keep.
- **Deliberately small.** It's built for one person, with no team features and no heavy
  features. A database is one block inside a page, with a Table and a Board view; its
  rows are not pages of their own. Anything else outside that scope is left out on
  purpose.
- **Free to run.** It fits inside the Vercel Hobby and Neon free tiers, with guards that
  stop strangers from using up those limits.

## Operating Context

- **The owner's daily writing** happens in the workspace: a page tree in the sidebar, a
  Tiptap block editor, the `/` menu, `@` dates, the quick switcher (`Ctrl K` / `⌘ K`) and
  the trash. It's used on desktop and on phones.
- **Claude** reaches the same pages over MCP at `/api/mcp`, through seven tools: list,
  search, read, create, update, move and delete. Page bodies go in and out as Markdown.
  claude.ai connects with OAuth 2.1 and sends the owner to an approval page on their own
  site. Claude Code can use OAuth or a static bearer token.
- **Evaluation** happens in the public demo at `/demo`. It runs the whole workspace in the
  browser on localStorage, with no login and no database. Every route is a static file.
  The one thing missing is Claude, because no MCP server can reach browser storage.
- **Setup** is a one-click Vercel deploy with a Neon integration, two environment
  variables (`NOTES_PASSWORD`, `NOTES_SESSION_SECRET`) and a login with a single password.

## Capabilities and Constraints

- **Today's features:** block editor (headings, lists, to-dos, quotes, code blocks,
  dividers, drag handles, Markdown shortcuts); nested pages with drag-and-drop and
  sub-page blocks; relative `@` dates; full-text quick switcher; autosave with conflict
  detection; trash with 30-day retention and undo; a Connected apps view that lists and
  revokes OAuth clients; light and dark themes that follow the system.
- **Single user, as built:** one password, a 30-day session cookie, no accounts. That's
  how the product works today. It hasn't been declared permanent.
- **Phones matter:** writing and reading on a phone is a real use, not an afterthought.
- **Keyboard-first:** everything should be reachable from the keyboard. `Ctrl K`, `/`,
  `@` and Markdown shortcuts are core interactions, not extras.
- **Free-tier budget:** server work and database wake-ups cost the owner's free-tier
  limits. The demo must stay fully static, and unauthenticated traffic must not reach the
  database.
- **Stack (existing):** Next.js 15 App Router with server actions, React 19, Tailwind CSS
  with shadcn/ui, Tiptap 3, the MCP TypeScript SDK, and Neon Postgres. Workspace reads and
  writes go through a swappable backend interface (`src/app/_components/backend.tsx`),
  which the server and the demo store both implement.
- **Terminology:** "page" (not note or document), "workspace", "trash", "quick switcher",
  "Connected apps", "sub-page".

## Brand Commitments

- The name is **note-scion**, always written in lowercase.
- The logo is `docs/logo.svg`.
- The existing voice (README, CHANGELOG, UI copy) is plain, calm and exact: short
  sentences, concrete facts, no hype or exclamation marks, and second person ("your
  notes stay in your own database").

## Evidence on Hand

- Live demo: https://notes.pradprat.blue/demo
- Screenshots: `docs/screenshot-light.png`, `docs/screenshot-dark.png`,
  `docs/quick-switcher.png`, `docs/slash-menu.png`
- Sample demo content written in Markdown: `src/app/demo/_lib/seed.ts`
- Version 1.0.0 was released on 2026-11-06 as the first public release, under the MIT
  license.
- **There are no** testimonials, user counts, star counts, benchmarks or press. Don't
  invent any.

## Product Principles

1. **Your notes, your database.** Never add a dependency that moves the owner's content
   to someone else's service.
2. **Claude is a second author, not a feature.** Every surface has to hold up when Claude
   edits the same page, and no edit from either side may be lost silently.
3. **Small on purpose.** Choose depth in writing, finding and organising over breadth.
   A feature that brings in teams, admin work, or databases beyond one block inside a page
   has to justify itself against the product's scope.
4. **Calm and fast.** The workspace stays out of the way: instant navigation, no noise,
   and quiet feedback.
5. **Keyboard and phone are both first-class.** A flow that works only with a mouse, or
   only on a wide screen, isn't finished.

## Accessibility & Inclusion

Full keyboard operation is a product requirement (see above). Phones are a supported
environment. No formal WCAG conformance level has been adopted as a hard requirement.
