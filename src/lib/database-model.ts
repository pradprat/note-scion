import { parseISODate } from "./dates";

/**
 * The data inside a database block. It lives in the page's own JSON, as the attributes
 * of one block, and in Markdown as the same JSON in a fenced block (see database.ts), so
 * it is written to be read: properties and option values are named, not numbered, and a
 * row maps a property's name to its value.
 *
 *     { "title": "Tasks",
 *       "properties": [{ "name": "Name", "type": "title" }, { "name": "Status", "type": "status", ... }],
 *       "rows": [{ "id": "r1", "cells": { "Name": "Write the spec", "Status": "In progress" } }],
 *       "views": { "active": "board", "groupBy": "Status" } }
 *
 * Everything here is plain functions on plain data, so the browser editor and the MCP
 * server's Markdown conversion share it. Every function returns new objects: the editor
 * keeps the old ones in its undo history.
 */

export const PROPERTY_TYPES = ["title", "text", "select", "status", "date", "checkbox", "number"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_LABELS: Record<PropertyType, string> = {
  title: "Title",
  text: "Text",
  select: "Select",
  status: "Status",
  date: "Date",
  checkbox: "Checkbox",
  number: "Number",
};

/** Where a status sits in the work, so the board and table can draw it without a color. */
export const STATUS_GROUPS = ["todo", "doing", "done"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export interface DbOption {
  name: string;
  /** Status options only. */
  group?: StatusGroup;
}

export interface DbProperty {
  name: string;
  type: PropertyType;
  /** Select and status properties only. */
  options?: DbOption[];
}

/** A cell's value: option name, text, "YYYY-MM-DD", number or true. An empty cell has no key. */
export type CellValue = string | number | boolean;

export interface DbRow {
  id: string;
  cells: Record<string, CellValue>;
}

export interface DbViews {
  active: "table" | "board";
  /** The select or status property the board groups by. */
  groupBy?: string;
}

export interface DatabaseData {
  title: string;
  properties: DbProperty[];
  rows: DbRow[];
  views: DbViews;
}

const MAX_NAME = 120;
const MAX_TEXT = 20_000;
/** Names that would be read as the object's own prototype when used as a key. */
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

export const isOptionType = (type: PropertyType) => type === "select" || type === "status";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

let counter = 0;
/** Short ids for rows: readable in Markdown, unique within a page for all practical purposes. */
export function newId(prefix = "r"): string {
  counter = (counter + 1) % 1_679_616;
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** A name, trimmed and kept short, that can't collide with the object's own keys. */
export function cleanName(value: unknown, fallback: string): string {
  const name = (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  if (!name) return fallback;
  return RESERVED.has(name) ? `${name}_` : name;
}

/** `name`, or "name 2", "name 3"… when another entry already has it. */
export function uniqueName(taken: Iterable<string>, name: string): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export const defaultOptions = (type: PropertyType): DbOption[] | undefined => {
  if (type === "status") {
    return [
      { name: "Not started", group: "todo" },
      { name: "In progress", group: "doing" },
      { name: "Done", group: "done" },
    ];
  }
  return type === "select" ? [] : undefined;
};

/** A new database: a title, a status and a date, and three empty rows to start on. */
export function newDatabase(): DatabaseData {
  return {
    title: "",
    properties: [
      { name: "Name", type: "title" },
      { name: "Status", type: "status", options: defaultOptions("status") },
      { name: "Date", type: "date" },
    ],
    rows: [0, 1, 2].map(() => ({ id: newId(), cells: {} })),
    views: { active: "table", groupBy: "Status" },
  };
}

/** What a value of this type is when it's well formed; null for an empty cell. */
function coerce(type: PropertyType, value: unknown): CellValue | null {
  switch (type) {
    case "title":
    case "text": {
      const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
      return text ? text.slice(0, MAX_TEXT) : null;
    }
    case "number": {
      const number = typeof value === "string" && value.trim() ? Number(value) : value;
      return typeof number === "number" && Number.isFinite(number) ? number : null;
    }
    case "checkbox":
      return value === true || value === "true" ? true : null;
    case "date":
      return typeof value === "string" && parseISODate(value) ? value : null;
    case "select":
    case "status": {
      const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "";
      return name || null;
    }
  }
}

function normalizeOptions(type: PropertyType, input: unknown): DbOption[] {
  const seen = new Set<string>();
  const options: DbOption[] = [];
  for (const entry of Array.isArray(input) ? input : []) {
    const raw: Record<string, unknown> = isObject(entry) ? entry : { name: entry };
    const name = coerce("select", raw.name);
    if (typeof name !== "string" || seen.has(name)) continue;
    seen.add(name);
    const group = (STATUS_GROUPS as readonly unknown[]).includes(raw.group) ? (raw.group as StatusGroup) : "todo";
    options.push(type === "status" ? { name, group } : { name });
  }
  return options;
}

/**
 * Any value read from a page (the editor's attributes, or JSON Claude wrote) made into a
 * database that is safe to draw and to write back: one title property, first; unique
 * property names; options that exist for every select value (a name Claude writes that
 * isn't an option yet becomes one); and no empty cells. Applying it to its own output
 * changes nothing, which is what lets a page go out as Markdown and come back the same.
 */
export function normalizeDatabase(input: unknown): DatabaseData {
  const source = isObject(input) ? input : {};
  const title = typeof source.title === "string" ? source.title.slice(0, 200) : "";

  const names = new Set<string>();
  let properties: DbProperty[] = [];
  let hasTitle = false;
  for (const entry of Array.isArray(source.properties) ? source.properties : []) {
    if (!isObject(entry)) continue;
    let type = (PROPERTY_TYPES as readonly unknown[]).includes(entry.type) ? (entry.type as PropertyType) : "text";
    // Only one title: a second becomes plain text.
    if (type === "title") {
      if (hasTitle) type = "text";
      hasTitle = true;
    }
    const name = uniqueName(names, cleanName(entry.name, PROPERTY_LABELS[type]));
    names.add(name);
    properties.push(isOptionType(type) ? { name, type, options: normalizeOptions(type, entry.options) } : { name, type });
  }
  if (!hasTitle) properties.unshift({ name: uniqueName(names, "Name"), type: "title" });
  // The title leads, wherever it was written.
  properties = [...properties.filter((p) => p.type === "title"), ...properties.filter((p) => p.type !== "title")];

  const rows: DbRow[] = [];
  const ids = new Set<string>();
  for (const entry of Array.isArray(source.rows) ? source.rows : []) {
    const raw = isObject(entry) ? entry : {};
    const cells: Record<string, CellValue> = {};
    const given = isObject(raw.cells) ? raw.cells : {};
    for (const property of properties) {
      if (!has(given, property.name)) continue;
      const value = coerce(property.type, given[property.name]);
      if (value === null) continue;
      if (isOptionType(property.type) && !property.options!.some((o) => o.name === value)) {
        property.options!.push(property.type === "status" ? { name: value as string, group: "todo" } : { name: value as string });
      }
      cells[property.name] = value;
    }
    let id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 60) : newId();
    while (ids.has(id)) id = newId();
    ids.add(id);
    rows.push({ id, cells });
  }

  const views = isObject(source.views) ? source.views : {};
  const groupable = properties.filter((p) => isOptionType(p.type));
  const groupBy = groupable.find((p) => p.name === views.groupBy) ?? groupable[0];
  const active = views.active === "board" ? "board" : "table";
  return { title, properties, rows, views: groupBy ? { active, groupBy: groupBy.name } : { active } };
}

// --- Reading ---------------------------------------------------------------------------

export const cellOf = (row: DbRow, name: string): CellValue | undefined =>
  has(row.cells, name) ? row.cells[name] : undefined;

export const titleProperty = (db: DatabaseData): DbProperty => db.properties[0];

export const groupableProperties = (db: DatabaseData) => db.properties.filter((p) => isOptionType(p.type));

export const groupProperty = (db: DatabaseData): DbProperty | undefined =>
  groupableProperties(db).find((p) => p.name === db.views.groupBy) ?? groupableProperties(db)[0];

export interface BoardColumn {
  /** The option's name; null for rows with no value. */
  key: string | null;
  group?: StatusGroup;
  rows: DbRow[];
}

/** The board's columns for a property: its options in order, then rows with none. */
export function boardColumns(db: DatabaseData, property: DbProperty): BoardColumn[] {
  const columns: BoardColumn[] = (property.options ?? []).map((o) => ({ key: o.name, group: o.group, rows: [] }));
  const none: BoardColumn = { key: null, rows: [] };
  for (const row of db.rows) {
    const value = cellOf(row, property.name);
    (columns.find((c) => c.key === value) ?? none).rows.push(row);
  }
  return [none, ...columns];
}

// --- Changing --------------------------------------------------------------------------

const withProperty = (db: DatabaseData, name: string, change: (p: DbProperty) => DbProperty): DatabaseData => ({
  ...db,
  properties: db.properties.map((p) => (p.name === name ? change(p) : p)),
});

export const setTitle = (db: DatabaseData, title: string): DatabaseData => ({ ...db, title: title.slice(0, 200) });

export function addRow(db: DatabaseData, cells: Record<string, CellValue> = {}): { db: DatabaseData; id: string } {
  const row: DbRow = { id: newId(), cells };
  return { db: { ...db, rows: [...db.rows, row] }, id: row.id };
}

export const deleteRow = (db: DatabaseData, id: string): DatabaseData => ({
  ...db,
  rows: db.rows.filter((r) => r.id !== id),
});

/** Sets a cell; an empty value (null, "", false, NaN) clears it. */
export function setCell(db: DatabaseData, rowId: string, name: string, value: CellValue | null): DatabaseData {
  const property = db.properties.find((p) => p.name === name);
  if (!property) return db;
  const clean = value === null ? null : coerce(property.type, value);
  const next = withOption(db, property, clean);
  return {
    ...next,
    rows: next.rows.map((row) => {
      if (row.id !== rowId) return row;
      const cells = { ...row.cells };
      if (clean === null) delete cells[name];
      else cells[name] = clean;
      return { ...row, cells };
    }),
  };
}

/** A select value that isn't an option yet becomes one, so a cell never names nothing. */
function withOption(db: DatabaseData, property: DbProperty, value: CellValue | null): DatabaseData {
  if (!isOptionType(property.type) || typeof value !== "string" || property.options!.some((o) => o.name === value)) {
    return db;
  }
  return addOption(db, property.name, value);
}

export function addProperty(db: DatabaseData, type: PropertyType, name?: string): { db: DatabaseData; name: string } {
  const unique = uniqueName(
    db.properties.map((p) => p.name),
    cleanName(name, PROPERTY_LABELS[type])
  );
  // A database has one title; asking for another gives plain text.
  const kind = type === "title" ? "text" : type;
  const options = defaultOptions(kind);
  const property: DbProperty = options ? { name: unique, type: kind, options } : { name: unique, type: kind };
  let next: DatabaseData = { ...db, properties: [...db.properties, property] };
  if (isOptionType(kind) && !groupProperty(db)) next = { ...next, views: { ...next.views, groupBy: unique } };
  return { db: next, name: unique };
}

export function renameProperty(db: DatabaseData, from: string, to: string): DatabaseData {
  const target = uniqueName(
    db.properties.filter((p) => p.name !== from).map((p) => p.name),
    cleanName(to, from)
  );
  if (target === from || !db.properties.some((p) => p.name === from)) return db;
  const renamed = withProperty(db, from, (p) => ({ ...p, name: target }));
  return {
    ...renamed,
    rows: renamed.rows.map((row) => {
      if (!has(row.cells, from)) return row;
      const cells: Record<string, CellValue> = {};
      for (const [key, value] of Object.entries(row.cells)) cells[key === from ? target : key] = value;
      return { ...row, cells };
    }),
    views: { ...renamed.views, ...(renamed.views.groupBy === from && { groupBy: target }) },
  };
}

/** The title can't be deleted: a row with nothing to call it by would have no handle. */
export function deleteProperty(db: DatabaseData, name: string): DatabaseData {
  const property = db.properties.find((p) => p.name === name);
  if (!property || property.type === "title") return db;
  const next: DatabaseData = {
    ...db,
    properties: db.properties.filter((p) => p.name !== name),
    rows: db.rows.map((row) => {
      if (!has(row.cells, name)) return row;
      const cells = { ...row.cells };
      delete cells[name];
      return { ...row, cells };
    }),
  };
  return normalizeDatabase({ ...next, views: { ...next.views, groupBy: db.views.groupBy === name ? undefined : db.views.groupBy } });
}

export function addOption(db: DatabaseData, propertyName: string, name: string, group?: StatusGroup): DatabaseData {
  const clean = cleanName(name, "");
  return withProperty(db, propertyName, (p) => {
    if (!isOptionType(p.type) || !clean || p.options!.some((o) => o.name === clean)) return p;
    const option: DbOption = p.type === "status" ? { name: clean, group: group ?? "todo" } : { name: clean };
    return { ...p, options: [...p.options!, option] };
  });
}

export function renameOption(db: DatabaseData, propertyName: string, from: string, to: string): DatabaseData {
  const property = db.properties.find((p) => p.name === propertyName);
  if (!property?.options) return db;
  const target = uniqueName(
    property.options.filter((o) => o.name !== from).map((o) => o.name),
    cleanName(to, from)
  );
  if (target === from) return db;
  const renamed = withProperty(db, propertyName, (p) => ({
    ...p,
    options: p.options!.map((o) => (o.name === from ? { ...o, name: target } : o)),
  }));
  return {
    ...renamed,
    rows: renamed.rows.map((row) =>
      cellOf(row, propertyName) === from ? { ...row, cells: { ...row.cells, [propertyName]: target } } : row
    ),
  };
}

export function setOptionGroup(db: DatabaseData, propertyName: string, name: string, group: StatusGroup): DatabaseData {
  return withProperty(db, propertyName, (p) =>
    p.type === "status" ? { ...p, options: p.options!.map((o) => (o.name === name ? { ...o, group } : o)) } : p
  );
}

/** Removing an option empties the cells that had it. */
export function deleteOption(db: DatabaseData, propertyName: string, name: string): DatabaseData {
  const removed = withProperty(db, propertyName, (p) => ({ ...p, options: p.options?.filter((o) => o.name !== name) }));
  return {
    ...removed,
    rows: removed.rows.map((row) => {
      if (cellOf(row, propertyName) !== name) return row;
      const cells = { ...row.cells };
      delete cells[propertyName];
      return { ...row, cells };
    }),
  };
}

export function moveOption(db: DatabaseData, propertyName: string, name: string, by: -1 | 1): DatabaseData {
  return withProperty(db, propertyName, (p) => {
    const options = [...(p.options ?? [])];
    const from = options.findIndex((o) => o.name === name);
    const to = from + by;
    if (from < 0 || to < 0 || to >= options.length) return p;
    [options[from], options[to]] = [options[to], options[from]];
    return { ...p, options };
  });
}

/**
 * Moves a card to a board column (null for "no value"), before another card when one is
 * given and at the end of the column otherwise. The order of the rows is the order of the
 * cards, in the table too.
 */
export function moveRow(
  db: DatabaseData,
  rowId: string,
  propertyName: string,
  value: string | null,
  beforeId: string | null = null
): DatabaseData {
  const moving = db.rows.find((r) => r.id === rowId);
  if (!moving || rowId === beforeId) return db;
  const moved = setCell(db, rowId, propertyName, value);
  const row = moved.rows.find((r) => r.id === rowId)!;
  const rest = moved.rows.filter((r) => r.id !== rowId);
  let at = rest.findIndex((r) => r.id === beforeId);
  if (at < 0) {
    // After the last card already in that column; at the very end for an empty one.
    const last = rest.map((r) => cellOf(r, propertyName) ?? null).lastIndexOf(value);
    at = last < 0 ? rest.length : last + 1;
  }
  return { ...moved, rows: [...rest.slice(0, at), row, ...rest.slice(at)] };
}

export function setView(db: DatabaseData, views: Partial<DbViews>): DatabaseData {
  return { ...db, views: { ...db.views, ...views } };
}
