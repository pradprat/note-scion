# Changelog

All notable changes to note-scion are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- After an MCP client edits a page, its save status says which app made the change and
  how long ago ("Claude Code edited 4m ago"), until you edit the page again. Stored in
  two new columns, `notes_pages.mcp_editor` and `mcp_edited_at`, which the build adds.
- The demo's "Working with Claude" page can simulate an edit from Claude: after a short
  countdown, a to-do lands on the page as an MCP edit would, with the save status naming
  Claude, or the conflict bar if you're still typing. The welcome page points to it and
  now ends on deploying your own copy.
- The demo has a "Deploy your own" link in its top bar, on phones too. It and the sample
  page both go to the README's Deploy section.

### Changed

- The demo is called note-scion in its sidebar and browser tab, and its Demo badge is
  larger. The footer's "Deploy your own" and the Copy link button are gone from the demo.
- The demo's copy only says what's true there: its trash doesn't mention Claude, and
  says Reset demo clears it. On phones and tablets, the sample pages say tap, Search and +
  instead of Ctrl K, hover and drag.
- The conflict bar says the page changed "in another tab or by Claude" rather than
  "probably by Claude".

### Fixed

- The `/` and `@` menus no longer cover the line being typed or run off the bottom of the
  screen. They open above the line when there's more room there, including above a
  phone's keyboard.
- A long save status no longer overlaps the breadcrumb of a top-level page on phones.
- The MCP tools now say that a page created inside another isn't linked from the parent's
  body, and that an `@` date never links to a page, so Claude adds a real sub-page link
  instead of a date.

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

[Unreleased]: https://github.com/pradprat/note-scion/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/pradprat/note-scion/releases/tag/v1.0.0
