---
name: note-scion
description: A calm, shared writing desk for you and Claude, drawn in one cool slate scale.
colors:
  night-ink: "#0B0D10"
  deep-slate: "#171C22"
  graphite: "#2A333D"
  slate-pencil: "#5D6F82"
  frost-paper: "#E7EEF5"
  paper-white: "#FFFFFF"
  pale-rule: "#D5DEE7"
  lifted-pencil: "#8E9EAF"
  signal-red: "#DC2626"
typography:
  display:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  subtitle:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  ui:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.25
  ui-strong:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
  label:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
  code:
    fontFamily: "DM Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  kbd:
    fontFamily: "DM Mono, ui-monospace, monospace"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1rem
    letterSpacing: "0.025em"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.deep-slate}"
    textColor: "{colors.frost-paper}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.night-ink}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.night-ink}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.frost-paper}"
    textColor: "{colors.deep-slate}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.md}"
    size: "28px"
  input:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.night-ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  sidebar:
    backgroundColor: "{colors.frost-paper}"
    textColor: "{colors.graphite}"
    width: "256px"
  sidebar-row:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "8px"
    height: "32px"
  sidebar-row-active:
    backgroundColor: "{colors.pale-rule}"
    textColor: "{colors.night-ink}"
    typography: "{typography.ui-strong}"
  top-bar:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.night-ink}"
    typography: "{typography.ui}"
    padding: "0 16px"
    height: "48px"
  menu:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.md}"
    padding: "4px"
    width: "256px"
  menu-item-selected:
    backgroundColor: "{colors.frost-paper}"
    textColor: "{colors.deep-slate}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  kbd-hint:
    backgroundColor: "transparent"
    textColor: "{colors.slate-pencil}"
    typography: "{typography.kbd}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
  code-block:
    backgroundColor: "{colors.frost-paper}"
    textColor: "{colors.night-ink}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "0.9em 1em"
---

# Design System: note-scion

## Overview

**Creative North Star: "The Shared Desk"**

note-scion is one calm desk that two authors work at: the owner, and Claude over MCP.
Everything on it stays where it was left. When the other author changes something,
nothing flashes, sparkles or pops up. The page simply shows the newer text, the save
status says in a few plain words who made the edit and when, and if both of you edited
it, you're asked which version to keep. The visual system serves that trust. It's
quiet, predictable, and the same for both authors.

The desk is drawn in one cool slate scale of five steps, from Night Ink to Frost Paper,
on white paper in light mode and on the scale's darkest step in dark mode. There's no
brand accent color today. Hierarchy comes from the slate steps, from type weight, and
from space. The only color that arrives on its own is the emoji the owner picks as each
page's icon, and Signal Red when something is destructive or has gone wrong. The density
is that of a writing tool: a 256px page tree on the left, a 48px top bar, and a single
768px column of prose with generous air above it.

The components are precise and plain. They're the shadcn/ui and Notion patterns people
already know, at exact sizes, with nothing custom unless it earns its place. The custom
work all sits in the editor's details: a drag grip that lines up with the first line of
any block, `@` dates set as quiet grey words, and sub-page links one text line tall.

**Key Characteristics:**
- One cool slate scale (hue 210–217), inverted between light and dark modes, following
  the system setting.
- Instrument Sans for everything, with DM Mono only for code and key hints.
- Flat resting surfaces. Only things that float get a shadow.
- Gently rounded corners (4–8px). Nothing is pill-shaped except the spinner.
- Claude's edits look exactly like the owner's. Only the save status says who made the
  last edit, in words.
- Keyboard hints are shown wherever there's a pointer to read them, and hidden on touch.

## Colors

A single cool slate scale with near-neutral greys, used as tones of one ink rather than as
separate hues. The light-mode values are in the frontmatter. Dark mode runs the same scale
the other way (see the Dark-Mode Inversion Rule below).

### Primary
- **Deep Slate** (#171C22): the ink of a primary button in light mode, and the surface of
  the sidebar and of popovers in dark mode, one step up from the page.

### Neutral
- **Night Ink** (#0B0D10): body text, titles and the focus outline in light mode. In dark
  mode it's the page.
- **Graphite** (#2A333D): sidebar text in light mode. In dark mode it's hover and
  selected rows, borders and inputs, because it shows on both the page and Deep Slate.
- **Slate Pencil** (#5D6F82): secondary text in light mode (5.2:1 on white, 4.4:1 on the
  sidebar) and the focus ring in both modes.
- **Lifted Pencil** (#8E9EAF): secondary text in dark mode, where Slate Pencil would fall
  to about 3.8:1. Same hue, lighter tint.
- **Frost Paper** (#E7EEF5): the sidebar, muted fills, hover rows, code backgrounds and
  ghost-button hover in light mode. In dark mode it's the text.
- **Paper White** (#FFFFFF): the light-mode page, cards, popovers and inputs.
- **Pale Rule** (#D5DEE7): light-mode borders, input strokes and the selected sidebar row.
  It sits between Frost Paper and Slate Pencil, so lines still show on the sidebar.

### Status
- **Signal Red** (#DC2626 in light mode, #EF4444 in dark mode): destructive buttons, the
  trash-delete hover, error text, and the save status when there's a conflict or a page
  is missing. In light mode it reads at 4.8:1 as text on white and carries white text as
  a fill. In dark mode the lighter red reads at about 5:1 as text on Night Ink, and as a
  fill it carries Night Ink text (5.2:1), the same inversion as the primary button.

### Named Rules
**The Dark-Mode Inversion Rule.** Dark mode is not a separate palette. It's the same five
steps the other way round. Night Ink becomes the page, Deep Slate the sidebar and
popovers, Graphite the borders and hover rows, and Frost Paper the text. A new color
needs a role in both directions before it ships.

**The Tinted-Selection Rule.** Text selection, the drag outline and the drop cursor are
the foreground color at low alpha (16%, 5% and 40%), never a hue. Selection is a state of
the ink, not a new color.

## Typography

**Display Font:** Instrument Sans (with ui-sans-serif, system-ui)
**Body Font:** Instrument Sans
**Label/Mono Font:** DM Mono (with ui-monospace), for code and keyboard hints only

**Character:** A quiet grotesque with a variable weight axis does all the work. Hierarchy
comes from size and from in-between weights (650 for headings and bold text, rather than
700), so headings feel firm without shouting. DM Mono appears only where the text really
is code or a key.

### Hierarchy
- **Display** (700, 2.25rem, line-height 1.25, -0.025em, balanced wrap): the page title
  and the Trash heading. One per screen.
- **Headline** (650, 1.875rem, 1.3): Heading 1 in the editor.
- **Title** (650, 1.45rem, 1.3): Heading 2 in the editor.
- **Subtitle** (650, 1.2rem, 1.3): Heading 3 in the editor.
- **Body** (400, 1rem, 1.65): editor prose, in a column no wider than 768px (about 75
  characters).
- **UI** (400, or 500 for emphasis, 0.875rem): sidebar rows, buttons, menus, breadcrumbs
  and the save status.
- **Label** (400–500, 0.75rem): menu group headings, item descriptions, timestamps and
  help text, in muted color.
- **Kbd** (DM Mono 500, 0.625rem, 1rem line, uppercase, slight tracking): the `Ctrl K`
  hint and other key labels.

### Named Rules
**The 650 Rule.** Headings and bold text in the editor use weight 650, not 700. Only the
page title uses 700. Bold inside prose should feel like emphasis, not a shout.

**The Mono-Means-Literal Rule.** DM Mono is for text the reader would type or a machine
would read: code, key names, ids. Never use it as decoration or as a label style.

## Layout

The app is a sidebar and a page. The sidebar is a fixed 256px rail (288px as a sheet on
mobile, collapsible). The top bar is a 48px strip that sticks to the top of the page. The
page is one centred column, `max-width` 768px, with 24px side padding that widens to 64px
from 640px up. The page starts 40px below the top bar on phones and 64px on wider
screens, and there's a click-to-write area below the last block that's at least 35% of
the viewport tall.

Spacing follows Tailwind's 4px grid. Rows in the sidebar are 32px (28px for icon
buttons). Blocks in the editor are 0.35em apart, with more space above headings (1.4em,
1.2em, 1em). Lists indent 1.6em.

Below 768px the sidebar becomes a sheet. Input type matters as much as width:
- `pointer: coarse` raises sidebar rows and icon buttons to 40px.
- `hover: none` hides the drag grip and the keyboard hints, because a phone has no hover
  to reveal the grip and no keyboard to use the hints.
- On wide pointer screens the editor reaches 48px into the left margin, so the pointer
  finds a block's grip before it reaches the text, and the text itself doesn't move.

### Named Rules
**The One Column Rule.** Content lives in a single 768px column. No side panels, no
multi-column page layouts.

## Elevation & Depth

The system is flat by default. The page, sidebar and top bar are separated by tone (Paper
White against Frost Paper, or Night Ink against Deep Slate) and by hairline borders, not
by shadows. Shadows mark things that float above the page and will go away: the slash
menu, popovers, the quick switcher, dialogs and toasts. In dark mode, popovers also step
up one tone (to Deep Slate) so they separate from the page even where a shadow barely
shows. This is a default, not a ban: a later surface may add subtle depth if it needs it.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`):
  menus that open from the text, such as the slash menu, the date picker and popovers.
- **Overlay** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`):
  modal layers such as the quick switcher, dialogs and toasts.
- **Block halo** (`box-shadow: 0 0 0 4px hsl(var(--foreground) / 0.05)` over a 5% tinted
  fill): shows which block the drag grip under the pointer will move.

## Shapes

The base radius is 8px (`--radius`), with 6px and 4px steps below it. Buttons, inputs,
menus, sidebar rows and code blocks use 6px. Menu items, kbd hints and inline code use
4px. Inline `@` dates use 3px. Dialogs and the dashed empty box in Trash use 8px. Only the
spinner is fully round. Borders are 1px hairlines in Pale Rule or Graphite. The thickest
line in the system is the 3px Night Ink rule on the left of a quote block. Corners stay
soft enough to feel friendly and small enough that a column of rows still reads as a list
rather than a stack of cards.

## Components

### Buttons
Precise and plain: shadcn's button at exact sizes, with no custom shapes.
- **Shape:** gently rounded (6px).
- **Primary:** Deep Slate fill, Frost Paper text, 14px weight 500, 40px tall, 16px side
  padding. Hover lowers the fill to 90%. In dark mode the colors invert (Frost Paper fill,
  Night Ink text).
- **Outline:** a 1px Pale Rule stroke on the page color. Hover fills it with Frost Paper.
- **Ghost:** no fill until hover, then Frost Paper (Graphite in dark mode). This is the
  workhorse for toolbar and row actions.
- **Icon:** 28px square in the sidebar and 36px in lists, 40px on coarse pointers, with
  a 16px Lucide icon in muted color. In the trash, the delete action turns Signal Red on
  hover.
- **Focus:** a 2px Slate Pencil ring with a 2px offset. Elements that aren't shadcn
  components fall back to a 2px foreground outline with a 2px offset.

### Inputs / Fields
- **Style:** a 1px Pale Rule stroke on the page color, 6px radius, 40px tall, 12px side
  padding. Text is 16px on mobile, so iOS doesn't zoom, and 14px from 768px up.
- **Focus:** the same 2px Slate Pencil ring with an offset as buttons.
- **Disabled:** 50% opacity with a not-allowed cursor.
- **Title field:** the page title is a borderless, auto-growing textarea in the Display
  style. Its placeholder ("Untitled") is muted text at 60% opacity.

### Navigation
- **Sidebar:** Frost Paper (Deep Slate in dark mode). The workspace name sits in a 48px
  header in 14px weight 600. Rows are 32px, 14px, with a 16px-wide emoji or icon column
  and a chevron to expand nested pages. Hover and selection fill with Pale Rule (Graphite
  in dark mode), and the selected row also turns weight 500. Trash, Connected apps and
  Log out sit at the bottom, above a hairline.
- **Row actions:** with a mouse, a row's trash and + lie over the end of its title on
  the hover fill, only while the row is hovered or one of them has keyboard focus, so a
  title at rest has the whole row. On touch they fold into one 40px "⋯" that opens a
  two-item menu (Add a page inside, Move to trash), with 40px items.
- **Page tree from the keyboard:** one stop in the tab order, like a file tree. Up and
  Down move between visible pages, Right opens a page or steps into it, Left closes it or
  steps out to its parent, Home and End jump to the ends. Each row's link says whether
  it's expanded, and its list item carries its level. Only the focused row's trash and +
  buttons take Tab.
- **Skip link:** "Skip to page" is the first stop on every screen, shown on focus at the
  top left, and lands in the page title.
- **Top bar:** 48px, on the page color, with no border. On the left is a breadcrumb of
  emoji and title per page, where ancestors shrink before the current page does. On
  the right are the save status and the page's actions. The breadcrumb keeps at least
  96px; past that, a long save status gives way first.
- **Save status:** 12px muted text: "Saved", "Saving…", "Editing", turning Signal Red for
  a conflict. When an MCP client made the last edit it reads "Claude Code edited 4m ago"
  (the client's own registered name, or "Edited over MCP" for the static token), with
  the exact time on hover, until the owner edits again. A long client name truncates
  before the time does. Only the words are in the live region, so a screen reader
  hears them once when the edit arrives, not every minute as the time counts up.
- **Mobile:** the sidebar becomes a 288px sheet opened from the top bar.

### Named Rules
**The Authorship in Words Rule.** Who changed a page is said in plain words where the
save status lives: never as a badge, color, avatar, icon or AI styling, and never as a
notification.

### Menus (slash menu, quick switcher)
- **Slash menu:** a 256px Float panel with 4px padding and a 320px maximum height. Each
  item has a 32px icon tile (a bordered square on the page color), a 14px name and a
  12px muted description. The highlighted item fills with Frost Paper.
- **Placement (slash and `@` date menus):** 6px below the line being typed, or above it
  when the list doesn't fit below and there is more room above. Never over the line.
  The menu keeps its side while it still fits, and its height is capped at the room on
  that side, measured in the visual viewport so a phone keyboard counts. The list
  scrolls and keeps the highlighted item in view.
- **Quick switcher:** an Overlay dialog with its top edge pinned 15vh down (12vh on
  phones), so the search field stays put as results come and go. A 48px search field,
  then rows of emoji and title, with the page's path after the title in 12px muted
  text. A match found in a page's text adds a second 12px muted line with the words
  around it, the match itself in the ink color at weight 500. Selected rows fill with
  Frost Paper on a 4px radius. On coarse pointers its text is 16px.

### Toasts
Sonner, on the page color with a hairline border and the Overlay shadow. The undo toast
after a delete names the page in weight 500 and puts Undo as the only action.

### Kbd Hint
A 4px-radius chip with a 1px border in DM Mono at 10px, uppercase and muted, for example
`Ctrl K` next to Search. It's hidden on devices without hover.

### Editor Page (signature)
The page is the product, and its details are the system's distinctive work.
- **Drag grip:** a 20px-wide six-dot handle in the left margin, at the height of the
  block's first line (each heading level has its own height). It fills with Frost Paper
  and the text color on hover, and the Block halo appears under the block it will move.
- **`@` date:** a quiet word in muted text with a 70%-opacity `@`, not a pill, so the
  prose around it still reads. Within a day of now it says "@Yesterday", "@Today" or
  "@Tomorrow"; any other day reads in full, "@November 10, 2026".
- **Sub-page link:** one text line tall, with the page's emoji in a 20px column and the
  title in weight 500, underlined in Pale Rule with a 3px offset. Hover fills the row
  with Frost Paper. A missing page goes muted and loses its underline.
- **To-dos:** native checkboxes in the foreground color. A checked item turns muted and
  is struck through.
- **Quote:** a 3px Night Ink rule on the left with 16px padding.
- **Code:** DM Mono on Frost Paper with a hairline border, 6px radius for blocks and 4px
  for inline code.
- **Placeholder:** shown only in the empty block holding the cursor, in muted text.

## Do's and Don'ts

### Do:
- **Do** take every color from the five slate steps plus Paper White, Pale Rule, Lifted
  Pencil and Signal Red, through the shadcn CSS variables in `src/app/globals.css`.
- **Do** give every new color a role in both light and dark mode before shipping it (the
  Dark-Mode Inversion Rule).
- **Do** use Lifted Pencil (#8E9EAF), not Slate Pencil, for secondary text in dark mode.
- **Do** show hover state with a Frost Paper fill (Graphite in dark mode) and a 120ms
  ease-out color transition.
- **Do** raise touch targets to 40px under `pointer: coarse`, and hide hover-only
  affordances (drag grip, kbd hints) under `hover: none`.
- **Do** keep the page in its single 768px column with 24px padding on phones and 64px
  from 640px up.
- **Do** use the standard shadcn and Radix patterns for dialogs, popovers, menus and
  toasts. Build something custom only when the editor needs it.

### Don't:
- **Don't** style anything Claude does with sparkles, gradients, glows, "magic" purples
  or AI badges. Claude's edits and pages look exactly like the owner's. Who made the last
  edit is said in words in the save status (the Authorship in Words Rule).
- **Don't** add heavy chrome around the page: no cards inside cards, banners, thick
  borders or floating toolbars. Chrome stays in the sidebar and the 48px top bar, and the
  page stays bare.
- **Don't** put shadows on resting surfaces (page, sidebar, top bar, list rows) without a
  reason. Shadows mean "this floats".
- **Don't** set `@` dates, page links or tags as colored pills. Inline references stay
  words in the line.
- **Don't** use DM Mono for headings, labels or decoration.
- **Don't** use weight 700 inside the editor. Headings and bold text use 650.
