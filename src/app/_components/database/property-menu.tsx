"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Hash,
  List,
  Plus,
  SquareCheck,
  Text,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  PROPERTY_LABELS,
  PROPERTY_TYPES,
  STATUS_GROUPS,
  addOption,
  addProperty,
  deleteOption,
  deleteProperty,
  moveOption,
  renameOption,
  renameProperty,
  setOptionGroup,
  type DatabaseData,
  type DbProperty,
  type PropertyType,
  type StatusGroup,
} from "@/lib/database-model";
import { CELL_INPUT } from "./cells";

export const PROPERTY_ICONS: Record<PropertyType, LucideIcon> = {
  title: Type,
  text: Text,
  select: List,
  status: CircleDot,
  date: Calendar,
  checkbox: SquareCheck,
  number: Hash,
};

const GROUP_LABELS: Record<StatusGroup, string> = { todo: "To do", doing: "In progress", done: "Done" };

/** A menu button: icon and words, 32px (40px for a finger). */
const ITEM =
  "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none [@media(pointer:coarse)]:h-10";

/** A name that is kept when you press Enter or leave the field, not on every letter: renaming moves the cells under it. */
function NameField({
  value,
  onCommit,
  label,
  placeholder,
  autoFocus,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() && draft.trim() !== value) onCommit(draft);
    else setDraft(value);
  };
  return (
    <input
      value={draft}
      autoFocus={autoFocus}
      aria-label={label}
      placeholder={placeholder}
      className={cn(CELL_INPUT, "border bg-background")}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(value);
        }
      }}
    />
  );
}

function OptionRow({
  property,
  index,
  apply,
}: {
  property: DbProperty;
  index: number;
  apply: (change: (db: DatabaseData) => DatabaseData) => void;
}) {
  const option = property.options![index];
  const last = property.options!.length - 1;
  const icon = "flex h-8 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-8";
  return (
    <li className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <NameField
          value={option.name}
          label={`Option ${index + 1} name`}
          onCommit={(name) => apply((db) => renameOption(db, property.name, option.name, name))}
        />
      </div>
      {property.type === "status" && (
        <select
          value={option.group}
          aria-label={`Where ${option.name} sits`}
          onChange={(event) =>
            apply((db) => setOptionGroup(db, property.name, option.name, event.target.value as StatusGroup))
          }
          className="h-8 rounded border bg-background px-1 text-xs [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:text-base"
        >
          {STATUS_GROUPS.map((group) => (
            <option key={group} value={group}>
              {GROUP_LABELS[group]}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className={icon}
        disabled={index === 0}
        aria-label={`Move ${option.name} up`}
        onClick={() => apply((db) => moveOption(db, property.name, option.name, -1))}
      >
        <ChevronUp aria-hidden size={14} />
      </button>
      <button
        type="button"
        className={icon}
        disabled={index === last}
        aria-label={`Move ${option.name} down`}
        onClick={() => apply((db) => moveOption(db, property.name, option.name, 1))}
      >
        <ChevronDown aria-hidden size={14} />
      </button>
      <button
        type="button"
        className={icon}
        aria-label={`Delete option ${option.name}`}
        onClick={() => apply((db) => deleteOption(db, property.name, option.name))}
      >
        <X aria-hidden size={14} />
      </button>
    </li>
  );
}

/**
 * What a column header opens: its name, its options (select and status), and delete.
 * `children` is the header's button.
 */
export function PropertyMenu({
  property,
  apply,
  onRenamed,
  children,
}: {
  property: DbProperty;
  apply: (change: (db: DatabaseData) => DatabaseData) => void;
  /** Called with the old and the new name once a rename is made (the new one may differ from what was typed). */
  onRenamed?: (from: string, to: string) => void;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const Icon = PROPERTY_ICONS[property.type];
  return (
    <Popover onOpenChange={() => setConfirming(false)}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2" aria-label={`${property.name} property`}>
        <NameField
          value={property.name}
          label="Property name"
          onCommit={(name) =>
            apply((db) => {
              const next = renameProperty(db, property.name, name);
              const renamed = next.properties[db.properties.findIndex((p) => p.name === property.name)]?.name;
              if (renamed && renamed !== property.name) onRenamed?.(property.name, renamed);
              return next;
            })
          }
        />
        <p className="mt-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Icon aria-hidden size={14} />
          {PROPERTY_LABELS[property.type]}
        </p>

        {property.options && (
          <div className="mt-3">
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Options</p>
            <ul className="space-y-1">
              {property.options.map((option, index) => (
                <OptionRow key={index} property={property} index={index} apply={apply} />
              ))}
            </ul>
            <NewOption property={property} apply={apply} />
          </div>
        )}

        {property.type !== "title" && (
          <div className="mt-3 border-t pt-2">
            {confirming ? (
              <div className="px-1">
                <p className="pb-2 text-sm">Delete “{property.name}” and its values?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => apply((db) => deleteProperty(db, property.name))}
                    className="h-8 rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 [@media(pointer:coarse)]:h-10"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="h-8 rounded-md px-3 text-sm hover:bg-accent [@media(pointer:coarse)]:h-10"
                  >
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={cn(ITEM, "text-destructive")} onClick={() => setConfirming(true)}>
                Delete property
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NewOption({
  property,
  apply,
}: {
  property: DbProperty;
  apply: (change: (db: DatabaseData) => DatabaseData) => void;
}) {
  const [name, setName] = useState("");
  const add = () => {
    if (!name.trim()) return;
    apply((db) => addOption(db, property.name, name));
    setName("");
  };
  return (
    <div className="mt-1 flex items-center gap-1">
      <input
        value={name}
        aria-label="New option"
        placeholder="Add an option"
        className={cn(CELL_INPUT, "min-w-0 flex-1 border bg-background")}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
      />
      <button
        type="button"
        aria-label="Add option"
        disabled={!name.trim()}
        onClick={add}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
      >
        <Plus aria-hidden size={16} />
      </button>
    </div>
  );
}

/** The "+" at the end of the header: pick a type, with an optional name, and the column appears. */
export function AddPropertyMenu({
  apply,
  children,
}: {
  apply: (change: (db: DatabaseData) => DatabaseData) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setName("");
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2" aria-label="New property">
        <input
          autoFocus
          value={name}
          aria-label="New property name"
          placeholder="Property name"
          className={cn(CELL_INPUT, "mb-1 border bg-background")}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="px-1 py-1 text-xs font-medium text-muted-foreground">Type</p>
        {PROPERTY_TYPES.filter((type) => type !== "title").map((type) => {
          const Icon = PROPERTY_ICONS[type];
          return (
            <button
              key={type}
              type="button"
              className={ITEM}
              onClick={() => {
                apply((db) => addProperty(db, type, name).db);
                setOpen(false);
              }}
            >
              <Icon aria-hidden size={16} className="text-muted-foreground" />
              {PROPERTY_LABELS[type]}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
