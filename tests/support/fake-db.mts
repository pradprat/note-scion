/**
 * An in-memory stand-in for the Neon `sql` tagged template, so the MCP route and the
 * save logic in src/lib/db.ts can run in a test with no database at all.
 *
 * It is deliberately not a SQL engine. It recognises the exact statements db.ts and
 * oauth.ts send (matched on their text, with the `${}` slots as $1, $2, ...) and does what
 * each one does to a few arrays. A statement it doesn't know throws, so changing a query
 * in db.ts breaks these tests until the fake is updated alongside it. That keeps the fake
 * honest about what it covers, and also means these tests prove the JavaScript around the
 * queries (the route, the tools, the conflict handling), not that the SQL itself is right.
 */
import { mock } from "bun:test";

/** A database address that can't resolve. If the mock ever failed to apply, nothing real is reached. */
const FAKE_URL = "postgres://test:test@db.invalid/test";

export interface FakeRow {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  content: unknown;
  position: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  mcp_editor: string | null;
  mcp_edited_at: Date | null;
}

export interface FakeDb {
  pages: FakeRow[];
  /** Access tokens the fake knows, by token hash. */
  accessTokens: Map<string, { resource: string | null; clientName: string | null }>;
  /** Every statement received, normalised, in order. */
  queries: string[];
  /** Cache tags db.ts asked Next to drop. */
  revalidated: string[];
  /**
   * Runs just before each statement is handled, to make something else happen first: an
   * owner's save landing between a read and the write that follows it. Cleared by reset().
   */
  beforeStatement: ((statement: string) => void | Promise<void>) | null;
  /** A page as stored, for assertions that must not go through the code under test. */
  page(id: string): FakeRow | undefined;
  reset(): void;
}

type Params = unknown[];

export function installFakeDb(): FakeDb {
  // Never reach a database named in the environment: Bun loads .env.local on its own.
  process.env.DATABASE_URL = FAKE_URL;
  delete process.env.POSTGRES_URL;

  // The clock moves one second per write, so two saves never share a version.
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick));

  const db: FakeDb = {
    pages: [],
    accessTokens: new Map(),
    queries: [],
    revalidated: [],
    beforeStatement: null,
    page: (id) => db.pages.find((row) => row.id === id),
    reset() {
      db.beforeStatement = null;
      db.pages.length = 0;
      db.accessTokens.clear();
      db.queries.length = 0;
      db.revalidated.length = 0;
      tick = 0;
    },
  };

  const live = (row: FakeRow) => row.deleted_at === null;
  const liveById = (id: unknown) => db.pages.find((row) => row.id === id && live(row));
  const maxPosition = (parentId: string | null, except?: unknown) =>
    db.pages
      .filter((row) => row.parent_id === parentId && live(row) && row.id !== except)
      .reduce((max, row) => Math.max(max, row.position), 0);
  const node = (row: FakeRow) => ({
    id: row.id,
    parent_id: row.parent_id,
    title: row.title,
    icon: row.icon,
    position: row.position,
  });
  /** Ids of a page and everything under it, live or not as `include` decides. */
  const subtree = (rootId: string, include: (row: FakeRow) => boolean) => {
    const ids = new Set<string>();
    const walk = (id: string) => {
      ids.add(id);
      for (const child of db.pages) if (child.parent_id === id && include(child) && !ids.has(child.id)) walk(child.id);
    };
    walk(rootId);
    return ids;
  };

  const statements: [RegExp, (p: Params) => unknown[]][] = [
    // loadTree
    [
      /^select id, parent_id, title, icon, position from notes_pages where deleted_at is null order by position, created_at$/,
      () =>
        db.pages
          .filter(live)
          .sort((a, b) => a.position - b.position || a.created_at.getTime() - b.created_at.getTime())
          .map(node),
    ],
    // loadPage
    [
      /^select id, parent_id, title, icon, position, content, updated_at, mcp_editor, mcp_edited_at from notes_pages where id = \$1 and deleted_at is null$/,
      ([id]) => {
        const row = liveById(id);
        return row ? [{ ...node(row), content: row.content, updated_at: row.updated_at, mcp_editor: row.mcp_editor, mcp_edited_at: row.mcp_edited_at }] : [];
      },
    ],
    // createPage: the same parent id fills four slots
    [
      /^insert into notes_pages \(parent_id, position\) select/,
      ([parentId]) => {
        const parent = (parentId as string | null) ?? null;
        if (parent !== null && !liveById(parent)) return [];
        const stamp = now();
        const row: FakeRow = {
          id: crypto.randomUUID(),
          parent_id: parent,
          title: "",
          icon: null,
          content: null,
          position: maxPosition(parent) + 1,
          created_at: stamp,
          updated_at: stamp,
          deleted_at: null,
          mcp_editor: null,
          mcp_edited_at: null,
        };
        db.pages.push(row);
        return [node(row)];
      },
    ],
    // updatePage with nothing to change, and the existence check after a failed update
    [
      /^select updated_at from notes_pages where id = \$1 and deleted_at is null$/,
      ([id]) => {
        const row = liveById(id);
        return row ? [{ updated_at: row.updated_at }] : [];
      },
    ],
    [/^select 1 from notes_pages where id = \$1 and deleted_at is null$/, ([id]) => (liveById(id) ? [{ "?column?": 1 }] : [])],
    // updatePage: [hasTitle, title, hasIcon, icon, hasContent, content json, mcp client, isMcp, id, expected, expected]
    [
      /^update notes_pages set title = case when \$1::boolean .* returning updated_at$/,
      ([hasTitle, title, hasIcon, icon, hasContent, contentJson, client, isMcp, id, expected]) => {
        const row = liveById(id);
        if (!row) return [];
        // The real statement compares at millisecond precision, as ISO strings carry.
        if (expected !== null && row.updated_at.getTime() !== new Date(expected as string).getTime()) return [];
        if (hasTitle) row.title = title as string;
        if (hasIcon) row.icon = icon as string | null;
        if (hasContent) row.content = JSON.parse(contentJson as string);
        row.mcp_editor = (client as string | null) ?? null;
        row.mcp_edited_at = isMcp ? now() : null;
        row.updated_at = now();
        return [{ updated_at: row.updated_at }];
      },
    ],
    // movePage: cycle and target checks
    [
      /^with recursive descendants as/,
      ([id, parentId]) => {
        const below = subtree(id as string, () => true);
        below.delete(id as string);
        return [{ cycle: below.has(parentId as string), live: Boolean(liveById(parentId)) }];
      },
    ],
    // movePage: [parentId, position, parentId, id, id]
    [
      /^update notes_pages set parent_id = \$1::uuid, position = coalesce\(/,
      ([parentId, position, , , id]) => {
        const row = liveById(id);
        if (!row) return [];
        const parent = (parentId as string | null) ?? null;
        row.position = (position as number | null) ?? maxPosition(parent, id) + 1;
        row.parent_id = parent;
        row.updated_at = now();
        return [{ id: row.id }];
      },
    ],
    // trashPage
    [
      /^with recursive subtree as \( select id from notes_pages where id = \$1 and deleted_at is null .* update notes_pages set deleted_at = now\(\)/,
      ([id]) => {
        if (!liveById(id)) return [];
        const stamp = now();
        const ids = subtree(id as string, live);
        return db.pages.filter((row) => ids.has(row.id)).map((row) => ((row.deleted_at = stamp), { id: row.id }));
      },
    ],
    // oauth.verifyAccessToken: the token hash is the only parameter
    [
      /^select t\.resource, c\.client_name from oauth_tokens t/,
      ([hash]) => {
        const token = db.accessTokens.get(hash as string);
        return token ? [{ resource: token.resource, client_name: token.clientName }] : [];
      },
    ],
  ];

  async function fakeSql(strings: TemplateStringsArray, ...params: Params): Promise<unknown[]> {
    const text = strings.reduce((out, part, i) => out + (i ? `$${i}` : "") + part, "").replace(/\s+/g, " ").trim();
    db.queries.push(text);
    const hook = db.beforeStatement;
    if (hook) {
      // Off while it runs, so a write the hook makes isn't hooked in turn.
      db.beforeStatement = null;
      try {
        await hook(text);
      } finally {
        db.beforeStatement = hook;
      }
    }
    const match = statements.find(([pattern]) => pattern.test(text));
    if (!match) throw new Error(`fake sql: no handler for this statement. Add one to tests/support/fake-db.mts:\n${text}`);
    return match[1](params);
  }

  mock.module("@neondatabase/serverless", () => ({
    neon: (url: string) => {
      if (url !== FAKE_URL) throw new Error("tests must only ever use the fake database");
      return fakeSql;
    },
  }));

  // Next's data cache needs a running server. Here it is a pass-through, and the tags that
  // would have been dropped are recorded instead.
  mock.module("next/cache", () => ({
    unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    revalidateTag: (tag: string) => {
      db.revalidated.push(tag);
    },
  }));

  return db;
}
