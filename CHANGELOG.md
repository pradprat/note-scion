# Changelog

All notable changes to note-scion are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

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
  in localStorage and no login.
- Remote MCP server with seven tools, and an OAuth 2.1 authorization server with dynamic
  client registration, PKCE and refresh-token rotation.
- Server-side page caching and prefetch on hover.
- Light and dark themes.
- One-click deploy to Vercel with Neon; the build creates the tables.

[1.0.0]: https://github.com/pradprat/note-scion/releases/tag/v1.0.0
