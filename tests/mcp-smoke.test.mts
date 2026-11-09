/**
 * Smoke test for the MCP endpoint and the save and conflict logic, with no database:
 * src/lib/db.ts runs against the in-memory fake in tests/support/fake-db.mts.
 *
 *   bun test
 *
 * It calls the route handler directly, the way Next would, over MCP's JSON-RPC. It proves
 * the JavaScript (authorization, the seven tools, optimistic versioning, the Markdown
 * conversion). It does not prove the SQL; see the note in fake-db.mts.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDb } from "./support/fake-db.mts";

const db = installFakeDb();

// A throwaway token for this run only. It opens nothing real.
const STATIC_TOKEN = randomBytes(32).toString("base64url");
process.env.NOTES_MCP_TOKEN = STATIC_TOKEN;

// Imported after the mocks are in place, because db.ts reads its driver at import time.
const { POST, GET } = await import("@/app/api/mcp/route");
const { hashToken, randomToken } = await import("@/lib/oauth");
const { loadPage, updatePage } = await import("@/lib/db");

const ENDPOINT = "http://notes.test/api/mcp";

interface ToolReply {
  text: string;
  isError: boolean;
}

async function send(body: unknown, token: string | null = STATIC_TOKEN, method = "POST") {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const request = new Request(ENDPOINT, { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });
  return method === "GET" ? GET(request) : POST(request);
}

let nextId = 1;
async function call(name: string, args: Record<string, unknown> = {}, token: string | null = STATIC_TOKEN): Promise<ToolReply> {
  const response = await send({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }, token);
  expect(response.status).toBe(200);
  const reply = (await response.json()) as { result?: { content: { text: string }[]; isError?: boolean }; error?: { message: string } };
  // A schema problem comes back as a JSON-RPC error or an isError result, depending on the SDK.
  if (reply.error) return { text: reply.error.message, isError: true };
  return { text: reply.result!.content.map((part) => part.text).join("\n"), isError: Boolean(reply.result!.isError) };
}

/** The id in "(id: <uuid>)" or "id: <uuid>" from a tool's reply. */
const idIn = (text: string) => /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(text)![1];
/** A page's Markdown body, without the header read_page puts above it. */
const bodyOf = (readPage: string) => readPage.slice(readPage.indexOf("\n---\n\n") + 6);

beforeEach(() => db.reset());

describe("authorization", () => {
  test("no token is refused with a pointer to the OAuth metadata, and never reaches the database", async () => {
    const response = await send({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null);
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe("invalid_token");
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="http://notes.test/.well-known/oauth-protected-resource/api/mcp"'
    );
    expect(db.queries).toEqual([]);
  });

  test("a token that is not the static one nor a real access token is refused", async () => {
    // Shaped like one of ours (43 URL-safe characters), so it costs one lookup, which finds nothing.
    const response = await send({ jsonrpc: "2.0", id: 1, method: "tools/list" }, randomToken());
    expect(response.status).toBe(401);
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0]).toContain("from oauth_tokens");
  });

  test("a token that can't be one of ours is refused before any database query", async () => {
    for (const junk of ["x", "not a token", `${STATIC_TOKEN}x`, STATIC_TOKEN.slice(1)]) {
      const response = await send({ jsonrpc: "2.0", id: 1, method: "tools/list" }, junk);
      expect(response.status).toBe(401);
    }
    // STATIC_TOKEN.slice(1) and `${STATIC_TOKEN}x` are 42 and 44 characters: wrong shape.
    expect(db.queries).toEqual([]);
  });

  test("the Authorization header must be Bearer", async () => {
    const response = await POST(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Basic ${STATIC_TOKEN}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("the static token is accepted and the seven tools are listed", async () => {
    const response = await send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(response.status).toBe(200);
    const names = ((await response.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["create_page", "delete_page", "list_pages", "move_page", "read_page", "search_pages", "update_page"]);
    expect(db.queries).toEqual([]);
  });

  test("a static token shorter than 32 characters in the environment is ignored", async () => {
    const short = "short-token-0123456789";
    process.env.NOTES_MCP_TOKEN = short;
    try {
      const response = await send({ jsonrpc: "2.0", id: 1, method: "tools/list" }, short);
      expect(response.status).toBe(401);
    } finally {
      process.env.NOTES_MCP_TOKEN = STATIC_TOKEN;
    }
  });

  test("with no static token configured, only OAuth tokens get in", async () => {
    delete process.env.NOTES_MCP_TOKEN;
    try {
      expect((await send({ jsonrpc: "2.0", id: 1, method: "tools/list" }, STATIC_TOKEN)).status).toBe(401);
    } finally {
      process.env.NOTES_MCP_TOKEN = STATIC_TOKEN;
    }
  });

  describe("OAuth access tokens", () => {
    const grant = (resource: string | null, clientName: string | null) => {
      const token = randomToken();
      db.accessTokens.set(hashToken(token), { resource, clientName });
      return token;
    };

    test("a token issued for this endpoint gets in, and its client's name is recorded on edits", async () => {
      const token = grant("http://notes.test/api/mcp", "Claude");
      const created = await call("create_page", { title: "From OAuth" }, token);
      expect(created.isError).toBe(false);
      expect(db.page(idIn(created.text))?.mcp_editor).toBe("Claude");
    });

    test("a token issued for another resource is refused", async () => {
      const token = grant("http://elsewhere.test/api/mcp", "Claude");
      expect((await send({ jsonrpc: "2.0", id: 1, method: "tools/list" }, token)).status).toBe(401);
    });

    test("an unknown token is refused", async () => {
      expect((await send({ jsonrpc: "2.0", id: 1, method: "tools/list" }, randomToken())).status).toBe(401);
    });
  });
});

describe("tools", () => {
  test("list_pages says so when the workspace is empty", async () => {
    expect((await call("list_pages")).text).toBe("The workspace is empty.");
  });

  test("create_page, then list_pages shows it nested, then read_page returns it", async () => {
    const parent = await call("create_page", { title: "Projects", icon: "P" });
    expect(parent.isError).toBe(false);
    const parentId = idIn(parent.text);
    const child = await call("create_page", { title: "Alpha", markdown: "Some **text**.", parentId });
    const childId = idIn(child.text);

    expect((await call("list_pages")).text).toBe(`- P Projects (id: ${parentId})\n  - Alpha (id: ${childId})`);

    const read = (await call("read_page", { id: childId })).text;
    expect(read).toContain("Title: Alpha");
    expect(read).toContain("Path: P Projects / Alpha");
    expect(read).toContain(`URL: http://notes.test/${childId}`);
    expect(bodyOf(read)).toBe("Some **text**.");
    expect((await call("read_page", { id: parentId })).text).toContain(`Sub-pages: Alpha (id: ${childId})`);
  });

  test("create_page refuses a parent that doesn't exist", async () => {
    const reply = await call("create_page", { title: "Orphan", parentId: crypto.randomUUID() });
    expect(reply.isError).toBe(true);
    expect(db.pages).toHaveLength(0);
  });

  test("update_page replaces the body by default, and records that MCP made the edit", async () => {
    const id = idIn((await call("create_page", { title: "Notes", markdown: "old line" })).text);
    const reply = await call("update_page", { id, markdown: "new line", title: "Notes 2" });
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain("title, content");
    const read = (await call("read_page", { id })).text;
    expect(read).toContain("Title: Notes 2");
    expect(bodyOf(read)).toBe("new line");
    // The static token has no client name, but the page is still marked as an MCP edit.
    expect(db.page(id)?.mcp_editor).toBeNull();
    expect(db.page(id)?.mcp_edited_at).not.toBeNull();
  });

  test("update_page in append mode adds to the end and keeps what was there", async () => {
    const id = idIn((await call("create_page", { title: "Log", markdown: "first" })).text);
    await call("update_page", { id, markdown: "second", mode: "append" });
    await call("update_page", { id, markdown: "- third", mode: "append" });
    expect(bodyOf((await call("read_page", { id })).text)).toBe("first\n\nsecond\n\n- third");
  });

  test("update_page in append mode onto a page with no body just sets it", async () => {
    const id = idIn((await call("create_page", { title: "Empty" })).text);
    await call("update_page", { id, markdown: "hello", mode: "append" });
    expect(bodyOf((await call("read_page", { id })).text)).toBe("hello");
  });

  test("update_page changes the icon and clears it with null, leaving the body alone", async () => {
    const id = idIn((await call("create_page", { title: "Icons", markdown: "keep me", icon: "A" })).text);
    await call("update_page", { id, icon: "B" });
    expect((await call("read_page", { id })).text).toContain("Icon: B");
    await call("update_page", { id, icon: null });
    const read = (await call("read_page", { id })).text;
    expect(read).toContain("Icon: none");
    expect(bodyOf(read)).toBe("keep me");
  });

  test("update_page with nothing to change, or a page that isn't there, is an error", async () => {
    const id = idIn((await call("create_page", { title: "x" })).text);
    expect((await call("update_page", { id })).isError).toBe(true);
    expect((await call("update_page", { id: crypto.randomUUID(), title: "y" })).isError).toBe(true);
    expect((await call("update_page", { id: "not-a-uuid", title: "y" })).isError).toBe(true);
  });

  test("move_page nests a page, then returns it to the top level", async () => {
    const a = idIn((await call("create_page", { title: "A" })).text);
    const b = idIn((await call("create_page", { title: "B" })).text);
    expect((await call("move_page", { id: b, parentId: a })).text).toBe("Moved to: A / B");
    expect((await call("list_pages")).text).toBe(`- A (id: ${a})\n  - B (id: ${b})`);
    expect((await call("move_page", { id: b })).text).toBe("Moved to: B");
    expect((await call("list_pages")).text).toBe(`- A (id: ${a})\n- B (id: ${b})`);
  });

  test("move_page refuses to put a page inside itself or its own sub-page", async () => {
    const a = idIn((await call("create_page", { title: "A" })).text);
    const b = idIn((await call("create_page", { title: "B", parentId: a })).text);
    const own = await call("move_page", { id: a, parentId: a });
    expect(own.isError).toBe(true);
    expect(own.text).toContain("inside itself");
    const below = await call("move_page", { id: a, parentId: b });
    expect(below.isError).toBe(true);
    expect(below.text).toContain("own sub-page");
    expect((await call("move_page", { id: a, parentId: crypto.randomUUID() })).isError).toBe(true);
    // Nothing moved.
    expect(db.page(a)?.parent_id).toBeNull();
    expect(db.page(b)?.parent_id).toBe(a);
  });

  test("delete_page trashes the page and its sub-pages, and they stop being readable", async () => {
    const a = idIn((await call("create_page", { title: "A" })).text);
    const b = idIn((await call("create_page", { title: "B", parentId: a })).text);
    const keep = idIn((await call("create_page", { title: "Keep" })).text);

    const reply = await call("delete_page", { id: a });
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain("and 1 sub-page(s)");
    expect((await call("list_pages")).text).toBe(`- Keep (id: ${keep})`);
    expect((await call("read_page", { id: a })).isError).toBe(true);
    expect((await call("read_page", { id: b })).isError).toBe(true);
    // Trashed, not deleted: both rows are still stored, marked together.
    expect(db.page(a)?.deleted_at).not.toBeNull();
    expect(db.page(b)?.deleted_at).toEqual(db.page(a)?.deleted_at ?? null);
    expect(db.page(keep)?.deleted_at).toBeNull();
    // And a second delete finds nothing.
    expect((await call("delete_page", { id: a })).isError).toBe(true);
  });

  test("a page in the trash can't be updated or moved to", async () => {
    const a = idIn((await call("create_page", { title: "A" })).text);
    const b = idIn((await call("create_page", { title: "B" })).text);
    await call("delete_page", { id: a });
    expect((await call("update_page", { id: a, title: "revived" })).isError).toBe(true);
    expect((await call("move_page", { id: b, parentId: a })).isError).toBe(true);
    expect(db.page(a)?.title).toBe("A");
  });

  test("read_page on an unknown or malformed id is an error, not a crash", async () => {
    expect((await call("read_page", { id: crypto.randomUUID() })).isError).toBe(true);
    expect((await call("read_page", { id: "nope" })).isError).toBe(true);
  });

  test("a title change drops the cached tree, a body-only change doesn't", async () => {
    const id = idIn((await call("create_page", { title: "T" })).text);
    db.revalidated.length = 0;
    await call("update_page", { id, markdown: "body only" });
    expect(db.revalidated).toEqual([`notes-page-${id}`]);
    db.revalidated.length = 0;
    await call("update_page", { id, title: "T2" });
    expect(db.revalidated).toEqual([`notes-page-${id}`, "notes-tree"]);
  });

  test("Markdown for the existing block types reads back as it was written", async () => {
    // A small canonical sample through the route. The fuller round-trip fixture lives in
    // scripts/check-markdown.mts (feat/toggles), which this doesn't duplicate.
    const sample = [
      "# Heading one",
      "",
      "Text with **bold**, *italic*, ~~strike~~, `code` and [a link](https://example.com).",
      "",
      "- bullet",
      "- another",
      "",
      "1. first",
      "2. second",
      "",
      "- [ ] open to-do",
      "- [x] done to-do",
      "",
      "> a quote",
      "",
      "```",
      "const x = 1;",
      "```",
      "",
      "---",
      "",
      // The serializer's own form for a table: padded cells, and two blank lines before it.
      "",
      "| A   | B   |",
      "| --- | --- |",
      "| 1   | 2   |",
    ].join("\n");
    const id = idIn((await call("create_page", { title: "Round trip", markdown: sample })).text);
    expect(bodyOf((await call("read_page", { id })).text)).toBe(sample);
  });
});

describe("saving and conflicts (updatePage)", () => {
  async function pageWithBody(body = "original") {
    const id = idIn((await call("create_page", { title: "Page", markdown: body })).text);
    const page = (await loadPage(id))!;
    return { id, version: page.updatedAt };
  }

  test("an owner save on the version they loaded is saved and moves the version on", async () => {
    const { id, version } = await pageWithBody();
    const result = await updatePage(id, { title: "Mine" }, "owner", version);
    expect(result.status).toBe("saved");
    if (result.status === "saved") expect(result.updatedAt).not.toBe(version);
    expect((await loadPage(id))?.title).toBe("Mine");
  });

  test("a save on a version someone else has since replaced reports a conflict and changes nothing", async () => {
    const { id, version } = await pageWithBody("original");
    // Claude edits the page while the owner has it open.
    await call("update_page", { id, markdown: "Claude's edit", title: "Claude's title" });

    const result = await updatePage(id, { title: "Owner's title", content: { type: "doc", content: [{ type: "paragraph" }] } }, "owner", version);
    expect(result).toEqual({ status: "conflict" });

    const stored = await loadPage(id);
    expect(stored?.title).toBe("Claude's title");
    expect(bodyOf((await call("read_page", { id })).text)).toBe("Claude's edit");
    // The MCP edit is still shown as the last one: the refused save didn't clear it.
    expect(stored?.mcpEdit).not.toBeNull();
  });

  test("two owner saves from the same version: the first lands, the second conflicts", async () => {
    const { id, version } = await pageWithBody();
    expect((await updatePage(id, { title: "Tab one" }, "owner", version)).status).toBe("saved");
    expect(await updatePage(id, { title: "Tab two" }, "owner", version)).toEqual({ status: "conflict" });
    expect((await loadPage(id))?.title).toBe("Tab one");
  });

  test("the version the owner is told after a save is the one the next save needs", async () => {
    const { id, version } = await pageWithBody();
    const first = await updatePage(id, { title: "One" }, "owner", version);
    if (first.status !== "saved") throw new Error("expected saved");
    expect((await updatePage(id, { title: "Two" }, "owner", first.updatedAt)).status).toBe("saved");
  });

  test("passing no version is the 'keep my version' overwrite", async () => {
    const { id } = await pageWithBody();
    await call("update_page", { id, title: "Claude's title" });
    expect((await updatePage(id, { title: "Owner wins" }, "owner", null)).status).toBe("saved");
    expect((await loadPage(id))?.title).toBe("Owner wins");
  });

  test("the owner saving clears the 'edited by Claude' mark; an MCP write sets it", async () => {
    const { id } = await pageWithBody();
    expect((await loadPage(id))?.mcpEdit).not.toBeNull(); // create_page wrote the body over MCP
    await updatePage(id, { title: "Owner" }, "owner");
    expect((await loadPage(id))?.mcpEdit).toBeNull();
    await updatePage(id, { title: "Claude" }, { mcpClient: "Claude Code" });
    expect((await loadPage(id))?.mcpEdit?.client).toBe("Claude Code");
  });

  test("a page that is gone or in the trash is 'missing', not a conflict", async () => {
    const { id, version } = await pageWithBody();
    expect(await updatePage(crypto.randomUUID(), { title: "x" }, "owner", version)).toEqual({ status: "missing" });
    await call("delete_page", { id });
    expect(await updatePage(id, { title: "x" }, "owner", version)).toEqual({ status: "missing" });
    // An empty patch on a missing page too.
    expect(await updatePage(id, {}, "owner")).toEqual({ status: "missing" });
  });

  test("an empty patch on a live page changes nothing and returns its version", async () => {
    const { id, version } = await pageWithBody();
    expect(await updatePage(id, {}, "owner")).toEqual({ status: "saved", updatedAt: version });
  });

});

describe("update_page append while the owner saves", () => {
  const WRITE = "update notes_pages set title = case";
  const LOAD = "select id, parent_id, title, icon, position, content, updated_at";
  const paragraph = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const count = (from: number, prefix: string) => db.queries.slice(from).filter((q) => q.startsWith(prefix)).length;

  /**
   * An owner's save, as made in the app, that lands just before each of the next `times`
   * writes the tool makes: after the tool has read the page and before it writes it back.
   */
  function ownerSavesBeforeWrite(id: string, times: number) {
    let saved = 0;
    db.beforeStatement = async (statement) => {
      if (saved >= times || !statement.startsWith(WRITE)) return;
      saved++;
      await updatePage(id, { content: paragraph(`owner edit ${saved}`) }, "owner");
    };
  }

  async function page(body = "base") {
    return idIn((await call("create_page", { title: "Page", markdown: body })).text);
  }

  test("a save that lands between the read and the write of an append is kept, not overwritten", async () => {
    const id = await page();
    ownerSavesBeforeWrite(id, 1);
    const reply = await call("update_page", { id, markdown: "claude line", mode: "append" });
    expect(reply.isError).toBe(false);
    // The owner's edit replaced "base", and Claude's line went after it.
    expect(bodyOf((await call("read_page", { id })).text)).toBe("owner edit 1\n\nclaude line");
  });

  test("after a conflict it reads the page again and appends once, on the second attempt", async () => {
    const id = await page();
    ownerSavesBeforeWrite(id, 1);
    const from = db.queries.length;
    const reply = await call("update_page", { id, markdown: "claude line", mode: "append", title: "Retitled" });
    expect(reply.text).toBe('Updated "Retitled" (title, content).');
    expect(count(from, LOAD)).toBe(2);
    const stored = await loadPage(id);
    expect(stored?.title).toBe("Retitled");
    expect(bodyOf((await call("read_page", { id })).text).split("claude line")).toHaveLength(2); // once
    expect(stored?.mcpEdit).not.toBeNull();
  });

  test("when the page changes on every attempt it gives up after three, with an error and nothing written", async () => {
    const id = await page();
    ownerSavesBeforeWrite(id, 99);
    const from = db.queries.length;
    const reply = await call("update_page", { id, markdown: "claude line", mode: "append", title: "Retitled" });
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain("3 times");
    expect(reply.text).toContain("read_page");
    expect(count(from, LOAD)).toBe(3);
    const stored = await loadPage(id);
    expect(stored?.title).toBe("Page"); // the title in the same call wasn't applied either
    expect(bodyOf((await call("read_page", { id })).text)).toBe("owner edit 3");
  });

  test("replace is still an explicit overwrite, in one attempt", async () => {
    const id = await page();
    ownerSavesBeforeWrite(id, 1);
    const from = db.queries.length;
    const reply = await call("update_page", { id, markdown: "replacement" });
    expect(reply.isError).toBe(false);
    expect(count(from, LOAD)).toBe(1);
    expect(bodyOf((await call("read_page", { id })).text)).toBe("replacement");
  });

  test("a change of title or icon alone sends no version either", async () => {
    const id = await page();
    ownerSavesBeforeWrite(id, 1);
    expect((await call("update_page", { id, title: "New title", icon: "N" })).isError).toBe(false);
    const stored = await loadPage(id);
    expect([stored?.title, stored?.icon]).toEqual(["New title", "N"]);
  });

  test("an append to a page trashed in between is an error, not a silent success", async () => {
    const id = await page();
    db.beforeStatement = (statement) => {
      if (statement.startsWith(WRITE)) db.page(id)!.deleted_at = new Date();
    };
    const reply = await call("update_page", { id, markdown: "claude line", mode: "append" });
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain("No page with id");
  });
});

describe("GET", () => {
  test("a GET with no token is refused like any other request", async () => {
    const response = await send(null, null, "GET");
    expect(response.status).toBe(401);
  });
});
