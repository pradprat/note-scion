import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { JSONContent } from "@tiptap/core";
import { revalidateTag, unstable_cache } from "next/cache";
import type { NoteNode, NotePage, NotePatch, TrashItem } from "./types";

let client: NeonQueryFunction<false, false> | null = null;

export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Days a page stays in the trash before it is deleted for good. */
export const TRASH_DAYS = 30;

export function isPageId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

type Row = Record<string, unknown>;

const iso = (value: unknown) => new Date(value as string).toISOString();

function toNode(row: Row): NoteNode {
  return {
    id: row.id as string,
    parentId: (row.parent_id as string | null) ?? null,
    title: (row.title as string) ?? "",
    icon: (row.icon as string | null) ?? null,
    position: Number(row.position),
  };
}

// ----------------------------------------------------------------------- cache
//
// The tree and each page are kept in Next's data cache, so opening a page usually
// doesn't wait on the database (Neon sleeps when idle, and waking it is the slow part).
// Every write in this file drops what it changed, and nothing writes these tables except
// this file (server actions and the MCP route), so the cache can't go stale behind it.

const TREE_TAG = "notes-tree";
const PAGES_TAG = "notes-pages";
const pageTag = (id: string) => `notes-page-${id}`;

function invalidate(...tags: string[]) {
  for (const tag of tags) revalidateTag(tag);
}

// Every read and write below works on live pages only (deleted_at is null); the trash
// functions at the end are the only ones that see deleted pages.

async function loadTree(): Promise<NoteNode[]> {
  const rows = await sql()`
    select id, parent_id, title, icon, position
    from notes_pages
    where deleted_at is null
    order by position, created_at`;
  return rows.map(toNode);
}

export const getTree = unstable_cache(loadTree, ["notes-tree"], { tags: [TREE_TAG] });

export async function getFirstRootPageId(): Promise<string | null> {
  const first = (await getTree()).find((node) => node.parentId === null);
  return first?.id ?? null;
}

/** A page as cached. Use `loadPage` where only the stored copy will do. */
export async function getPage(id: string): Promise<NotePage | null> {
  if (!isPageId(id)) return null;
  return unstable_cache(() => loadPage(id), ["notes-page", id], { tags: [PAGES_TAG, pageTag(id)] })();
}

/** Reads a page straight from the database, skipping the cache. */
export async function loadPage(id: string): Promise<NotePage | null> {
  if (!isPageId(id)) return null;
  const rows = await sql()`
    select id, parent_id, title, icon, position, content, updated_at, mcp_editor, mcp_edited_at
    from notes_pages where id = ${id} and deleted_at is null`;
  const row = rows[0];
  if (!row) return null;
  return {
    ...toNode(row),
    content: (row.content as JSONContent | null) ?? null,
    updatedAt: iso(row.updated_at),
    mcpEdit: row.mcp_edited_at
      ? { client: (row.mcp_editor as string | null) ?? null, at: iso(row.mcp_edited_at) }
      : null,
  };
}

/**
 * Who a write comes from: the owner in the app, or an MCP client, by the name it
 * registered with (null for the static token). An MCP write is remembered on the page
 * until the owner next saves it.
 */
export type Writer = "owner" | { mcpClient: string | null };

export class PageNotFoundError extends Error {}

export async function createPage(parentId: string | null): Promise<NoteNode> {
  const rows = await sql()`
    insert into notes_pages (parent_id, position)
    select
      ${parentId}::uuid,
      (select coalesce(max(position), 0) + 1 from notes_pages
       where parent_id is not distinct from ${parentId}::uuid and deleted_at is null)
    where ${parentId}::uuid is null
       or exists (select 1 from notes_pages where id = ${parentId}::uuid and deleted_at is null)
    returning id, parent_id, title, icon, position`;
  if (!rows[0]) throw new PageNotFoundError("The parent page doesn't exist or is in the trash");
  invalidate(TREE_TAG);
  return toNode(rows[0]);
}

export type UpdateResult =
  | { status: "saved"; updatedAt: string }
  | { status: "conflict" }
  | { status: "missing" };

/**
 * Applies a patch. With `expectedUpdatedAt`, the write only lands if nobody else (the MCP
 * endpoint, another tab) has saved the page since that version; otherwise it reports a
 * conflict and changes nothing. Versions compare at millisecond precision, the most an
 * ISO string from JavaScript carries. A page in the trash counts as missing.
 */
export async function updatePage(
  id: string,
  patch: NotePatch,
  writer: Writer,
  expectedUpdatedAt: string | null = null
): Promise<UpdateResult> {
  const mcp = writer === "owner" ? null : writer;
  const hasTitle = patch.title !== undefined;
  const hasIcon = patch.icon !== undefined;
  const hasContent = patch.content !== undefined;
  if (!hasTitle && !hasIcon && !hasContent) {
    const rows = await sql()`select updated_at from notes_pages where id = ${id} and deleted_at is null`;
    if (!rows[0]) return { status: "missing" };
    return { status: "saved", updatedAt: iso(rows[0].updated_at) };
  }
  const rows = await sql()`
    update notes_pages set
      title = case when ${hasTitle}::boolean then ${patch.title ?? ""}::text else title end,
      icon = case when ${hasIcon}::boolean then ${patch.icon ?? null}::text else icon end,
      content = case when ${hasContent}::boolean
        then ${hasContent ? JSON.stringify(patch.content) : null}::jsonb else content end,
      mcp_editor = ${mcp?.mcpClient ?? null}::text,
      mcp_edited_at = case when ${mcp !== null}::boolean then now() else null end,
      updated_at = now()
    where id = ${id}
      and deleted_at is null
      and (${expectedUpdatedAt}::timestamptz is null
           or date_trunc('milliseconds', updated_at) = ${expectedUpdatedAt}::timestamptz)
    returning updated_at`;
  if (rows[0]) {
    // The sidebar only shows titles and icons, so a body edit leaves the tree cached.
    invalidate(pageTag(id), ...(hasTitle || hasIcon ? [TREE_TAG] : []));
    return { status: "saved", updatedAt: iso(rows[0].updated_at) };
  }
  const exists = await sql()`select 1 from notes_pages where id = ${id} and deleted_at is null`;
  return exists[0] ? { status: "conflict" } : { status: "missing" };
}

/** Case-insensitive match on the title or on any text inside the page body. */
export async function searchPages(query: string, limit = 20): Promise<NoteNode[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await sql()`
    select id, parent_id, title, icon, position
    from notes_pages p
    where p.deleted_at is null
      and (p.title ilike ${pattern}
           or exists (
             select 1 from jsonb_path_query(p.content, 'strict $.**.text') t
             where t #>> '{}' ilike ${pattern}
           ))
    order by p.updated_at desc
    limit ${limit}`;
  return rows.map(toNode);
}

export class MoveError extends Error {}

/**
 * Re-parents a page (null = top level). Without a position it goes after its new
 * siblings; with one (the sidebar's drag and drop) it takes exactly that slot.
 */
export async function movePage(id: string, parentId: string | null, position?: number): Promise<void> {
  if (parentId === id) throw new MoveError("A page can't be moved inside itself");
  if (position !== undefined && !Number.isFinite(position)) throw new MoveError("Invalid position");
  if (parentId) {
    const rows = await sql()`
      with recursive descendants as (
        select id from notes_pages where parent_id = ${id}
        union all
        select p.id from notes_pages p join descendants d on p.parent_id = d.id
      )
      select
        exists (select 1 from descendants where id = ${parentId}) as cycle,
        exists (select 1 from notes_pages where id = ${parentId} and deleted_at is null) as live`;
    if (!rows[0]?.live) throw new MoveError("The target page doesn't exist or is in the trash");
    if (rows[0]?.cycle) throw new MoveError("A page can't be moved inside its own sub-page");
  }
  const rows = await sql()`
    update notes_pages set
      parent_id = ${parentId}::uuid,
      position = coalesce(
        ${position ?? null}::double precision,
        (select coalesce(max(position), 0) + 1 from notes_pages
         where parent_id is not distinct from ${parentId}::uuid and id <> ${id} and deleted_at is null)
      ),
      updated_at = now()
    where id = ${id} and deleted_at is null
    returning id`;
  if (!rows[0]) throw new MoveError("That page doesn't exist or is in the trash");
  invalidate(TREE_TAG, pageTag(id));
}

// ----------------------------------------------------------------------- trash

/**
 * Moves a page and its live sub-pages to the trash, all stamped with the same time.
 * Returns how many pages went, or 0 if the page wasn't there.
 */
export async function trashPage(id: string): Promise<number> {
  const rows = await sql()`
    with recursive subtree as (
      select id from notes_pages where id = ${id} and deleted_at is null
      union all
      select p.id from notes_pages p join subtree s on p.parent_id = s.id where p.deleted_at is null
    )
    update notes_pages set deleted_at = now()
    where id in (select id from subtree)
    returning id`;
  // Sub-pages go too, so drop every cached page rather than track which.
  if (rows.length) invalidate(TREE_TAG, PAGES_TAG);
  return rows.length;
}

/**
 * Brings back a trashed page and the sub-pages deleted along with it. If its old parent
 * is gone or still in the trash, it comes back at the top level.
 */
export async function restorePage(id: string): Promise<NoteNode | null> {
  const rows = await sql()`
    with recursive target as (
      select id, deleted_at from notes_pages where id = ${id} and deleted_at is not null
    ),
    subtree as (
      select id, deleted_at from target
      union all
      select p.id, p.deleted_at from notes_pages p join subtree s
        on p.parent_id = s.id and p.deleted_at = s.deleted_at
    )
    update notes_pages set deleted_at = null
    where id in (select id from subtree)
    returning id`;
  if (!rows.length) return null;
  invalidate(TREE_TAG, PAGES_TAG);

  // Re-home it if the old parent isn't live (a no-op otherwise).
  const placed = await sql()`
    update notes_pages p set
      parent_id = null,
      position = (select coalesce(max(position), 0) + 1 from notes_pages
                  where parent_id is null and deleted_at is null)
    where p.id = ${id}
      and p.parent_id is not null
      and not exists (select 1 from notes_pages par where par.id = p.parent_id and par.deleted_at is null)
    returning id, parent_id, title, icon, position`;
  if (placed[0]) return toNode(placed[0]);
  const row = await sql()`select id, parent_id, title, icon, position from notes_pages where id = ${id}`;
  return row[0] ? toNode(row[0]) : null;
}

/** Deletes trash older than TRASH_DAYS. Sub-pages go through the cascade. */
export async function purgeOldTrash(): Promise<void> {
  await sql()`
    delete from notes_pages
    where deleted_at < now() - make_interval(days => ${TRASH_DAYS})`;
}

/**
 * The trash as the user thinks of it: one entry per delete, not per page. An entry is a
 * trashed page whose parent wasn't deleted in the same go.
 */
export async function listTrash(): Promise<TrashItem[]> {
  await purgeOldTrash();
  const rows = await sql()`
    with recursive roots as (
      select p.id, p.parent_id, p.title, p.icon, p.deleted_at
      from notes_pages p
      left join notes_pages par on par.id = p.parent_id
      where p.deleted_at is not null
        and (par.id is null or par.deleted_at is distinct from p.deleted_at)
    ),
    sub as (
      select r.id as root_id, r.id, r.deleted_at from roots r
      union all
      select s.root_id, c.id, c.deleted_at from notes_pages c
        join sub s on c.parent_id = s.id and c.deleted_at = s.deleted_at
    )
    select
      r.id, r.title, r.icon, r.deleted_at,
      case when par.deleted_at is null then par.title end as parent_title,
      (select count(*) - 1 from sub where sub.root_id = r.id) as sub_count
    from roots r
    left join notes_pages par on par.id = r.parent_id
    order by r.deleted_at desc`;
  return rows.map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? "",
    icon: (row.icon as string | null) ?? null,
    deletedAt: iso(row.deleted_at),
    parentTitle: (row.parent_title as string | null) ?? null,
    subPageCount: Number(row.sub_count),
  }));
}

/** Deletes a trashed page for good, with everything under it. Live pages are refused. */
export async function deleteForever(id: string): Promise<boolean> {
  const rows = await sql()`delete from notes_pages where id = ${id} and deleted_at is not null returning id`;
  return rows.length > 0;
}

export async function emptyTrash(): Promise<number> {
  const rows = await sql()`delete from notes_pages where deleted_at is not null returning id`;
  return rows.length;
}
