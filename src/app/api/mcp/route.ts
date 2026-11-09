import { createHash, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  createPage,
  getPage,
  getTree,
  isPageId,
  loadPage,
  MoveError,
  movePage,
  searchPages,
  trashPage,
  TRASH_DAYS,
  updatePage,
  type Writer,
} from "@/lib/db";
import { appendContent, fromMarkdown, toMarkdown } from "@/lib/markdown";
import {
  CORS_HEADERS,
  issuerFor,
  json,
  MCP_PATH,
  preflight,
  resourceFor,
  SCOPE,
  verifyAccessToken,
} from "@/lib/oauth";
import type { NoteNode, NotePatch } from "@/lib/types";

// Remote MCP server for the workspace (Streamable HTTP, stateless).
// Every request must carry a bearer token: an OAuth access token or NOTES_MCP_TOKEN.

export const dynamic = "force-dynamic";

const MAX_TITLE = 500;
/** How a title holds a date, as the app shows it (see src/lib/title-dates.ts). */
const TITLE_DATES = "A date in it is written @YYYY-MM-DD and reads as Today, Yesterday or Tomorrow, or in full, as in a page body: a daily page can be titled @2026-11-12.";
const MAX_ICON = 16;
const MAX_MARKDOWN = 500_000;

/**
 * Accepts either an OAuth access token issued for this endpoint (claude.ai and other
 * OAuth clients) or the static NOTES_MCP_TOKEN (Claude Code configured by hand), and
 * says who is writing: the OAuth client by its registered name, or no name for the
 * static token. Null when the request isn't allowed in.
 */
async function authorized(request: Request): Promise<Writer | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const staticToken = process.env.NOTES_MCP_TOKEN;
  if (staticToken && staticToken.length >= 32) {
    const hash = (value: string) => createHash("sha256").update(value).digest();
    if (timingSafeEqual(hash(token), hash(staticToken))) return { mcpClient: null };
  }
  const grant = await verifyAccessToken(token, resourceFor(request));
  return grant && { mcpClient: grant.clientName };
}

const label = (node: Pick<NoteNode, "title" | "icon">) =>
  `${node.icon ? `${node.icon} ` : ""}${node.title.trim() || "Untitled"}`;

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function pathOf(tree: NoteNode[], id: string): string {
  const byId = new Map(tree.map((node) => [node.id, node]));
  const parts: string[] = [];
  let current = byId.get(id);
  while (current && parts.length < 50) {
    parts.unshift(label(current));
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(" / ");
}

function outline(tree: NoteNode[]): string {
  const kids = (parentId: string | null) =>
    tree.filter((node) => node.parentId === parentId).sort((a, b) => a.position - b.position);
  const lines: string[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of kids(parentId)) {
      lines.push(`${"  ".repeat(depth)}- ${label(node)} (id: ${node.id})`);
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines.join("\n");
}

const pageId = z.string().describe("Page id (a UUID, from list_pages or search_pages)");
const parentIdInput = z
  .string()
  .nullable()
  .optional()
  .describe("Id of the page to nest under; omit or null for a top-level page");
const markdownInput = (what: string) =>
  z
    .string()
    .max(MAX_MARKDOWN)
    .describe(
      `${what} as Markdown. Supported: # to ### headings, paragraphs, **bold**, *italic*, ~~strike~~, \`code\`, [links](url), - bullets, 1. numbered lists, - [ ] / - [x] to-dos (nestable), > quotes, \`\`\` code blocks and --- dividers.`
    );

/**
 * `origin` is this site as the request saw it, for the page links in tool replies;
 * `writer` is the client calling, recorded on the pages it edits.
 */
function buildServer(origin: string, writer: Writer): McpServer {
  const pageUrl = (id: string) => `${origin}/${id}`;
  const server = new McpServer({ name: "note-scion", version: "1.0.0" });

  server.registerTool(
    "list_pages",
    {
      title: "List pages",
      description: "List every page in the notes workspace as a nested outline with ids.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const tree = await getTree();
      return text(tree.length ? outline(tree) : "The workspace is empty.");
    }
  );

  server.registerTool(
    "search_pages",
    {
      title: "Search pages",
      description: "Find pages whose title or body contains the text (case-insensitive).",
      inputSchema: { query: z.string().min(1).max(200).describe("Text to look for") },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const [matches, tree] = await Promise.all([searchPages(query), getTree()]);
      if (!matches.length) return text(`No pages match "${query}".`);
      return text(matches.map((node) => `- ${pathOf(tree, node.id)} (id: ${node.id})`).join("\n"));
    }
  );

  server.registerTool(
    "read_page",
    {
      title: "Read page",
      description: "Read a page's title, icon, location and full body as Markdown.",
      inputSchema: { id: pageId },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const page = await getPage(id);
      if (!page) return fail(`No page with id ${id}.`);
      const tree = await getTree();
      const children = tree.filter((node) => node.parentId === id);
      const header = [
        `Title: ${page.title.trim() || "Untitled"}`,
        `Icon: ${page.icon ?? "none"}`,
        `Path: ${pathOf(tree, id)}`,
        `Sub-pages: ${children.length ? children.map((c) => `${label(c)} (id: ${c.id})`).join(", ") : "none"}`,
        `Updated: ${page.updatedAt}`,
        `URL: ${pageUrl(id)}`,
      ].join("\n");
      const titleOf = (pageId: string) => tree.find((node) => node.id === pageId)?.title.trim();
      return text(`${header}\n\n---\n\n${toMarkdown(page.content, titleOf) || "(empty page)"}`);
    }
  );

  server.registerTool(
    "create_page",
    {
      title: "Create page",
      description:
        "Create a new page, optionally inside another page, with an optional Markdown body. A page created inside another one is filed under it in the page tree, but nothing is added to the parent's body. To show a link to it there, add a line that is only [Title](/<id>) to the parent with update_page (mode 'append' adds it at the end).",
      inputSchema: {
        title: z.string().max(MAX_TITLE).describe(`Page title. ${TITLE_DATES}`),
        markdown: markdownInput("Page body").optional(),
        icon: z.string().max(MAX_ICON).optional().describe("A single emoji, e.g. 📝"),
        parentId: parentIdInput,
      },
    },
    async ({ title, markdown, icon, parentId }) => {
      const parent = parentId ?? null;
      if (parent && !(await getPage(parent))) return fail(`No parent page with id ${parent}.`);
      const node = await createPage(parent);
      const patch: NotePatch = { title };
      if (icon) patch.icon = icon;
      if (markdown) patch.content = fromMarkdown(markdown);
      await updatePage(node.id, patch, writer);
      return text(`Created "${title || "Untitled"}" (id: ${node.id})\n${pageUrl(node.id)}`);
    }
  );

  server.registerTool(
    "update_page",
    {
      title: "Update page",
      description:
        "Change a page's title, icon or body. The body is replaced by default; set mode to 'append' to add to the end. Omitted fields are left as they are. A line that is only a link to a page, like [Title](/<id>), becomes a sub-page block that shows that page's live title; keep those lines as they are when rewriting a body. Write a date as @YYYY-MM-DD (for example @2026-11-12) to make it a date the app shows as Today, Tomorrow or the date. A date is only a date: it never links to a page, even one titled with that date; link pages with [Title](/<id>).",
      inputSchema: {
        id: pageId,
        title: z.string().max(MAX_TITLE).optional().describe(`New title. ${TITLE_DATES}`),
        icon: z
          .string()
          .max(MAX_ICON)
          .nullable()
          .optional()
          .describe("New emoji icon, or null to remove it"),
        markdown: markdownInput("New body content").optional(),
        mode: z
          .enum(["replace", "append"])
          .optional()
          .describe("How to apply markdown: replace the body (default) or append to it"),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, title, icon, markdown, mode }) => {
      const page = await loadPage(id); // read-modify-write: never from the cache
      if (!page) return fail(`No page with id ${id}.`);
      const patch: NotePatch = {};
      if (title !== undefined) patch.title = title;
      if (icon !== undefined) patch.icon = icon;
      if (markdown !== undefined) {
        const body = fromMarkdown(markdown);
        patch.content = mode === "append" ? appendContent(page.content, body) : body;
      }
      if (!Object.keys(patch).length) return fail("Nothing to change: pass title, icon or markdown.");
      await updatePage(id, patch, writer);
      return text(`Updated "${(title ?? page.title) || "Untitled"}" (${Object.keys(patch).join(", ")}).`);
    }
  );

  server.registerTool(
    "move_page",
    {
      title: "Move page",
      description: "Move a page (with its sub-pages) inside another page, or to the top level.",
      inputSchema: { id: pageId, parentId: parentIdInput },
    },
    async ({ id, parentId }) => {
      const parent = parentId ?? null;
      if (!(await getPage(id))) return fail(`No page with id ${id}.`);
      if (parent && !(await getPage(parent))) return fail(`No parent page with id ${parent}.`);
      try {
        await movePage(id, parent);
      } catch (error) {
        if (error instanceof MoveError) return fail(error.message);
        throw error;
      }
      const tree = await getTree();
      return text(`Moved to: ${pathOf(tree, id)}`);
    }
  );

  server.registerTool(
    "delete_page",
    {
      title: "Delete page",
      description: `Move a page and all of its sub-pages to the trash. The owner can restore it from the Trash in the notes app for ${TRASH_DAYS} days; after that it is deleted for good.`,
      inputSchema: { id: pageId },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const page = await getPage(id);
      if (!page) return fail(`No page with id ${id}.`);
      const count = await trashPage(id);
      const extra = count > 1 ? ` and ${count - 1} sub-page(s)` : "";
      return text(`Moved "${label(page)}"${extra} to the trash. It can be restored for ${TRASH_DAYS} days.`);
    }
  );

  return server;
}

async function handle(request: Request): Promise<Response> {
  const writer = await authorized(request);
  if (!writer) {
    // Points OAuth clients at the discovery document (RFC 9728 / MCP auth spec).
    const metadata = `${issuerFor(request)}/.well-known/oauth-protected-resource${MCP_PATH}`;
    return json({ error: "invalid_token", error_description: "Missing or invalid access token" }, 401, {
      "www-authenticate": `Bearer resource_metadata="${metadata}", scope="${SCOPE}"`,
    });
  }
  // A stateless server has no notification stream to offer, and an open GET would hold
  // this function until Vercel's 300 s timeout. The spec allows 405 for that.
  if (request.method === "GET") {
    return json({ error: "method_not_allowed", error_description: "This server has no GET stream" }, 405, {
      allow: "POST, DELETE, OPTIONS",
    });
  }
  // Stateless: a fresh server and transport per request, no session ids.
  const server = buildServer(issuerFor(request), writer);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
