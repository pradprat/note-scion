# note-scion

A private, single-user notes app in the style of Notion, that Claude can read and write.

You get a block editor with nested pages, and Claude gets the same pages through a remote
[MCP](https://modelcontextprotocol.io) server: it can list, search, read, write, move and
delete your notes from claude.ai, Claude Code or any MCP client. One password opens it; it
runs on Next.js and Postgres and deploys to Vercel's free tier.

## Features

- **Block editor** (Tiptap): headings, lists, to-dos, quotes, code blocks and dividers from
  the `/` menu or Markdown shortcuts; drag any block by its handle.
- **Nested pages**: a page tree in the sidebar with drag-and-drop to nest and reorder, and
  sub-page blocks inside pages.
- **Dates**: type `@` for Today, Tomorrow, next Friday or any date; they read as relative
  dates and stay correct as days pass.
- **Quick switcher**: `Ctrl/⌘ K` searches titles and page text, or creates a page.
- **Autosave with conflict detection**: edits save as you type. If Claude (or another tab)
  changed the page in the meantime, you choose which version to keep instead of losing one.
- **Trash**: deleted pages stay for 30 days, with undo right after a delete.
- **Fast**: pages are cached on the server and prefetched on hover.
- **Light and dark**, following your system.
- **MCP server with OAuth 2.1**: dynamic client registration, PKCE and refresh tokens, so
  claude.ai can connect with a URL alone. "Connected apps" lists and revokes connections.

## Deploy

You need a Postgres database. [Neon](https://neon.tech) works out of the box and has a free
tier; the app talks to it over HTTP with Neon's serverless driver.

1. **Fork or clone** this repo and import it in [Vercel](https://vercel.com/new).
2. **Add a database**: in the Vercel project, Storage → Neon (this sets `DATABASE_URL`), or
   paste a connection string from your own Neon project.
3. **Set the environment variables** (see [`.env.example`](.env.example)):

   | Variable | |
   | --- | --- |
   | `DATABASE_URL` | Postgres connection string. `POSTGRES_URL` is read as a fallback. |
   | `NOTES_PASSWORD` | The password that opens the workspace. |
   | `NOTES_SESSION_SECRET` | Signs the login cookie. 16+ characters; use `openssl rand -base64 32`. |
   | `NOTES_MCP_TOKEN` | Optional. A static bearer token (32+ characters) for MCP clients you configure by hand. |

4. **Create the tables** once, from your machine:

   ```sh
   bun install
   # put DATABASE_URL in .env.local (or `vercel env pull .env.local`)
   bun run db:migrate
   ```

5. **Deploy**, open the site and log in.

### Run it locally

```sh
bun install
cp .env.example .env.local   # fill it in
bun run db:migrate
bun dev                      # http://localhost:3000
```

## Connect Claude

The MCP endpoint is `https://<your-site>/api/mcp`. It offers `list_pages`, `search_pages`,
`read_page`, `create_page`, `update_page`, `move_page` and `delete_page`, with page bodies
as Markdown.

- **claude.ai**: Settings → Connectors → Add custom connector, and paste the endpoint URL.
  Claude discovers the OAuth server, registers itself and sends you to your site to approve
  the connection.
- **Claude Code**, with OAuth:

  ```sh
  claude mcp add --transport http notes https://<your-site>/api/mcp
  ```

  or with the static token:

  ```sh
  claude mcp add --transport http notes https://<your-site>/api/mcp \
    --header "Authorization: Bearer $NOTES_MCP_TOKEN"
  ```

## How it's built

Next.js 15 (App Router, server actions), React 19, Tailwind CSS with
[shadcn/ui](https://ui.shadcn.com), Tiptap 3, and the MCP TypeScript SDK. All data is one
`notes_pages` table plus three OAuth tables ([`scripts/schema.sql`](scripts/schema.sql));
page bodies are stored as Tiptap JSON and converted to and from Markdown for MCP.

| Path | |
| --- | --- |
| `src/app/(app)` | The workspace: page view, trash, connected apps |
| `src/app/_components` | Editor, sidebar, quick switcher and the rest of the UI |
| `src/app/api/mcp` | The MCP server |
| `src/app/oauth`, `src/app/.well-known` | The OAuth authorization server and its discovery documents |
| `src/lib` | Database access, sessions, OAuth, Markdown conversion |

## Security model

note-scion is built for **one person**. There are no user accounts: one password signs a
30-day session cookie (HMAC-SHA256), checked again by every page load and server action. MCP
access needs an OAuth access token bound to your endpoint, or the static token. Only hashes
of OAuth tokens and codes are stored.

Use a long, random password and session secret. To report a vulnerability, see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
