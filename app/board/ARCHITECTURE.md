# ani board — architecture (v1, single authority)

ani board is an infinite-canvas whiteboard and diagram tool in the class of FigJam, draw.io and
tldraw, built on `@freestylejs/ani-layout` v3 and its drive seam. This document is the single
authority for the app: the code, the tests and the docs implement exactly what it says. Where it
is silent, the most conservative reading applies and the gap is reported to the orchestrator, who
amends this document.

> **Essential purpose.** A tool a person chooses to use: direct manipulation is exact and
> instant, nothing the user did is ever lost, and every motion is either the exact specified
> motion or none ("snap, never wrong motion"). The details are everything.

## 1. Scope

### 1.1 Goals (v1)

| Area | v1 contents |
|---|---|
| Canvas | Infinite pan and zoom (10% to 800%), dot grid, zoom to fit, to selection, to 100% |
| Shapes | Rectangle, ellipse, diamond, triangle, sticky note, text, frame, line, arrow, freehand pen, image |
| Connectors | Straight, elbow (orthogonal, routed around the two bound shapes) and curved; bound to shapes; arrowheads; a label |
| Selection | Click, shift-click, marquee, select all, groups (enter with double-click), lock |
| Transform | Move, resize with 8 handles (aspect lock, from centre), rotate (15° steps with shift), nudge |
| Snapping | Grid, other shapes' edges and centres, equal spacing, with guides |
| Frames | Plain frames and auto-layout frames (row or column, gap, padding, alignment), with clipping |
| Editing | Text in every shape, sticky notes and text shapes; styles panel (fill, stroke, width, dash, opacity, radius, font size, alignment) |
| Structure | Layers panel (reorder, rename, show and hide, lock), z-order, align and distribute, tidy up |
| History | Undo and redo of every document change, grouped by gesture |
| Clipboard | Copy, cut, paste, duplicate; paste of board data, plain text and images from the system |
| Files | Autosave to IndexedDB; a board list; export SVG, PNG and JSON (all or selection); import JSON |
| UI | Toolbar, styles panel, layers panel, context menu, zoom controls, minimap, shortcuts dialog, light and dark themes |
| Quality | Keyboard-complete operation, screen-reader announcements, reduced motion, 1,000 shapes at 60 fps |

### 1.2 Non-goals (v1)

These are out of scope for v1: multiplayer and cross-tab sync, comments, pages, plugins, a server
or account, embedded fonts, PDF export, and touch-first mobile layout. Touch and pen input work
through pointer events, but the UI is laid out for desktop.

## 2. Package and stack

- `app/board` is a private workspace package (`@freestylejs/ani-board`, `"private": true`). It is
  built with Vite and React 19 in TypeScript strict mode.
- Its dependencies are the workspace's `@freestylejs/ani-core`, `@freestylejs/ani-layout` and
  `@freestylejs/ani-react`, plus `react` and `react-dom`. Any other runtime dependency needs an
  amendment.
- Styling is plain CSS with custom-property tokens: no CSS framework and no external fonts. The
  font stack is the system UI stack, plus a system monospace stack for code-like text.
- Scripts: `dev`, `build`, `preview`, `test` (Vitest with jsdom), `test:e2e` (Playwright in
  Chromium and WebKit), `ts:typecheck`.

### 2.1 Module map

Dependencies point downward only. `model`, `geometry`, `store`, `camera` and `tools` are pure:
they have no DOM and no React, and are fully unit tested.

| Module | Contents | May import |
|---|---|---|
| `model/` | Records, ids, fractional indices, the schema validator, migrations (none in v1) | — |
| `geometry/` | Vectors, matrices, bounds, rotated rectangles, hit tests, shape outlines, connector routing, snapping | `model` |
| `store/` | The document store, transactions, patches, history, selection, subscriptions | `model`, `geometry` |
| `camera/` | The camera, screen–page mapping, zoom about a point, fit | `geometry` |
| `tools/` | One state machine per tool on normalized input events | `model`, `geometry`, `store`, `camera` |
| `persist/` | IndexedDB autosave, the board library, JSON import and export | `model`, `store` |
| `export/` | SVG and PNG rendering of a document or a selection | `model`, `geometry` |
| `motion/` | The ani-layout integration (§9) | `store`, layout and react packages |
| `render/` | React components for the canvas, the shapes and the overlay | all above |
| `ui/` | Toolbar, panels, menus, dialogs | all above |
| `app/` | Composition root, keyboard map, theme | all above |

## 3. Document model

### 3.1 Records

Every record is a plain, frozen, JSON-serializable object. Records are replaced, never mutated.

```ts
type ShapeId = `shape:${string}`
type BindingId = `binding:${string}`
type AssetId = `asset:${string}`

type ShapeType =
  | 'rect' | 'ellipse' | 'diamond' | 'triangle' | 'sticky' | 'text'
  | 'frame' | 'line' | 'arrow' | 'draw' | 'image' | 'group'

interface ShapeBase {
  readonly id: ShapeId
  readonly type: ShapeType
  readonly parent: ShapeId | null   // a frame or a group; null at the board root
  readonly index: string            // fractional index among siblings (§3.3)
  readonly x: number                // parent space, top-left of the unrotated box
  readonly y: number
  readonly w: number                // ≥ 0
  readonly h: number                // ≥ 0
  readonly rotation: number         // radians, about the box centre, normalized to [0, 2π)
  readonly locked: boolean
  readonly hidden: boolean
  readonly name: string             // '' = the default name of its type and ordinal
  readonly opacity: number          // 0..1
}
```

| Type | Props beyond the base |
|---|---|
| `rect`, `ellipse`, `diamond`, `triangle` | `fill`, `stroke`, `strokeWidth`, `dash`, `radius` (rect only), `text` (§3.2) |
| `sticky` | `color` (one of 8 sticky colours), `text`; fixed shadow; `w` and `h` default 200 |
| `text` | `text`, `autoWidth: boolean`; the box follows the text |
| `frame` | `fill`, `clip: boolean`, `layout: null \| { dir: 'row' \| 'column', gap, padding: [t, r, b, l], align: 'start' \| 'center' \| 'end', wrap: boolean }` |
| `line`, `arrow` | `points` (a polyline in shape space, ≥ 2), `stroke`, `strokeWidth`, `dash`, `route: 'straight' \| 'elbow' \| 'curved'`, `start` and `end` heads (`none`, `arrow`, `triangle`, `dot`, `bar`; `arrow` defaults the end to `arrow`), `label` |
| `draw` | `points` with pressure, `stroke`, `strokeWidth`; simplified on commit (§5.4) |
| `image` | `asset: AssetId`, `crop: null` in v1 |
| `group` | none; its box is the union of its children's boxes, recomputed on every change |

- Colours are tokens (`'black'`, `'grey'`, `'red'`, `'orange'`, `'yellow'`, `'green'`, `'blue'`,
  `'violet'`, plus `'none'` for fill), resolved per theme. They are never raw CSS strings in the
  document.
- `dash` is `'solid' | 'dashed' | 'dotted'`.

```ts
interface Binding {
  readonly id: BindingId
  readonly connector: ShapeId       // a line or an arrow
  readonly end: 'start' | 'end'
  readonly target: ShapeId
  readonly anchor: { readonly x: number; readonly y: number } // normalized 0..1 in the target's box
  readonly precise: boolean         // false: the connector aims at the target's centre and stops at its outline
}

interface Asset {
  readonly id: AssetId
  readonly mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml'
  readonly src: string              // data URL
  readonly w: number                // natural size, px
  readonly h: number
  readonly hash: string             // SHA-256 of the bytes, hex; deduplicates
}

interface BoardDocument {
  readonly schema: 1
  readonly id: string
  readonly name: string
  readonly shapes: ReadonlyMap<ShapeId, Shape>
  readonly bindings: ReadonlyMap<BindingId, Binding>
  readonly assets: ReadonlyMap<AssetId, Asset>
}
```

### 3.2 Text

- Text is plain text with line breaks: no rich text in v1.
- Props:
  - `fontSize`: `S` 14, `M` 18, `L` 24, `XL` 36 page px;
  - `align`: `start`, `middle`, `end`;
  - `valign`: `top`, `middle`, `bottom` (shapes only).
- Text in a shape wraps to the shape's box minus 8 page px padding per side, and never resizes the
  shape. A sticky note shrinks its font by steps, down to `S`, to fit.
- A `text` shape with `autoWidth` grows its width; otherwise it wraps at `w`. Its height always
  follows the text.
- Measurement is the DOM's: the renderer reports the measured size, and the store writes it in
  the same transaction as the edit.

### 3.3 Order

- Siblings are ordered by `index`, a fractional index string over base 62 (`0-9A-Za-z`), compared
  by code unit.
- `between(a, b)` returns the shortest key strictly between `a` and `b`, either of which may be
  open. It is deterministic, so no jitter is needed.
- Paint order is depth first: a parent before its children, siblings by index.
- The layers panel lists the top of the paint order first.

### 3.4 Invariants

The validator checks these invariants. Every transaction's result must pass it, or the
transaction is rejected whole and the store is unchanged.

1. Every `parent` names an existing `frame` or `group`. The parent graph has no cycle.
2. A group has at least 2 children. A transaction that leaves a group with 1 child replaces the
   group with that child, keeping its paint position; with 0 children, the group is deleted.
3. Indices are unique among siblings.
4. Every binding's connector is a `line` or an `arrow`, and its target exists, is not the
   connector itself, and is not a `line`, `arrow` or `draw`. There is at most one binding per
   connector end.
5. Every `image` names an existing asset. Assets referenced by no shape are dropped at save.
6. Every number is finite. `w`, `h` and `strokeWidth` are ≥ 0, and `opacity` is in [0, 1].
7. A child of an auto-layout frame has its `x` and `y` computed by the layout (§6.3). The stored
   values are those positions.

## 4. Store and history

### 4.1 Transactions

```ts
interface Store {
  readonly doc: BoardDocument
  readonly selection: ReadonlySet<ShapeId>
  readonly editing: ShapeId | null
  transact(label: string, fn: (tx: Tx) => void, options?: { history?: 'push' | 'merge' | 'skip' }): void
  undo(): void
  redo(): void
  subscribe(listener: (change: Change) => void): () => void
}

interface Tx {
  get(id: ShapeId): Shape | undefined
  put(shape: Shape): void              // insert or replace
  update(id: ShapeId, patch: Partial<Shape>): void
  remove(id: ShapeId): void            // removes the subtree and its bindings
  bind(binding: Binding): void
  unbind(id: BindingId): void
  putAsset(asset: Asset): void
  select(ids: Iterable<ShapeId>): void
}
```

- A transaction runs `fn` against a draft.
- It then derives everything that depends on what changed, in this order:
  1. group boxes;
  2. auto-layout positions (§6.3);
  3. connector geometry of every connector bound to a changed shape (§6.2).
- It validates the result (§3.4) and commits it atomically.
- If `fn` throws or the validator rejects, nothing changes and the error is rethrown with the
  label.
- The commit computes **patches**: forward and inverse, one per changed record. It notifies
  subscribers once, with the set of changed ids.

### 4.2 History

- Each committed transaction with `history: 'push'` adds one entry: the patches, plus the
  selection before and after.
- A gesture (drag, resize, rotate, a text-edit session, a slider drag in the styles panel) begins
  with `push` and continues with `merge`. The gesture is one entry, and its inverse restores the
  state before the gesture.
- `skip` is for derived or non-document state: measurement echoes and camera. It never changes
  the document in a way the user did not cause.
- `undo` applies an entry's inverse patches and restores its selection before. `redo` applies the
  forward patches and its selection after. Both are transactions with `history: 'skip'` that move
  the cursor.
- A new `push` after an undo drops the redo tail.
- The stack holds 500 entries. The oldest are dropped.
- Undo and redo never move the camera.
- Undo during a gesture first cancels the gesture: its merged changes are reverted, and the
  history is left unchanged.

### 4.3 Subscriptions

- React components subscribe through `useSyncExternalStore`, with a selector per shape id.
- A change re-renders only the components whose selected records changed (by identity).
- The camera is a separate store (§7). Pan and zoom never re-render a shape component.

## 5. Geometry

All geometry is pure. Every function is tested against hand-computed values.

### 5.1 Spaces

| Space | Origin and units |
|---|---|
| Screen | The canvas element's top-left, CSS px |
| Page | The board's origin; 1 page px = 1 CSS px at zoom 1 |
| Parent | A frame's or group's top-left in page space, unrotated (frames do not rotate in v1; groups rotate their children as a unit) |
| Shape | The shape's unrotated top-left |

- `pageTransform(shape)` composes the parents' transforms down to the shape. A rotation is
  applied about the box centre.
- `pageBounds(shape)` is the axis-aligned bounds of the transformed box. For connectors and pen
  strokes, it is the bounds of their outline, including stroke width and heads.

### 5.2 Hit testing

- Tolerance is `4 / zoom` page px.
- **Closed shapes.** A point hits a closed shape (`rect`, `ellipse`, `diamond`, `triangle`,
  `sticky`, `text`, `image`) when it is inside the outline or within the tolerance of it. This
  applies whatever the fill.
- **Strokes.** Lines, arrows and pen strokes are hit within `tolerance + strokeWidth / 2` of the
  path.
- **Frames.** A frame is hit on its title label, or inside its body when nothing inside is hit.
  A clipped frame hides the hits of its children outside it.
- **Order.** The topmost hit in paint order wins, skipping hidden shapes. Locked shapes are
  skipped for selection but hit for the context menu.
- **Groups.** A click on a child of an unentered group selects the group. Double-click enters it,
  and Escape leaves it.
- **Marquee.** It selects shapes whose page bounds are fully inside it. With Alt held, it selects
  shapes it intersects. It never selects into a group that has not been entered.

### 5.3 Snapping

- Snapping applies while moving, resizing and drawing.
- **Threshold.** It is `6 / zoom` page px, and Ctrl or Meta held disables it.
- **Candidates.** Snapping considers these candidates:
  - **edges and centres:** the edges and centre lines of up to 50 visible shapes nearest the
    moving box, excluding the moving shapes and their descendants;
  - **equal spacing:** gaps between neighbours on the same axis that match;
  - **the grid:** 8 page px, used only when the grid is shown.
- **Resolution.** Per axis, the candidate with the smallest distance wins. Ties go to edges over
  centres over spacing over the grid.
- **Guides.** Snapped lines are drawn as 1 screen px guides, with red distance labels for equal
  spacing. They clear when the gesture ends.
- **Rotation.** Rotation snaps to 15° with Shift held, and to 0° when within 1°.

### 5.4 Pen

- Input points are collected at pointer-event rate, including coalesced events.
- On commit, the stroke is simplified (Ramer–Douglas–Peucker, ε = 0.5 / zoom page px) and stored.
- It is drawn as a smoothed outline: Catmull-Rom spline to cubic Bézier segments, with width
  modulated by pressure (0.5 when the device reports none).

### 5.5 Connector routing

- **Endpoints.** A bound end sits at the target's anchor. When it is not `precise`, it sits on the
  line from the target's centre to the other end, clipped to the target's outline, plus a 4 page
  px gap. A free end is a stored point.
- **Straight.** One segment.
- **Curved.** One cubic Bézier, with control points along each end's outward normal at
  min(distance / 2, 120) page px.
- **Elbow.** The shortest orthogonal path between the two ends:
  - it leaves each bound end along the outward normal of the side nearest its anchor;
  - it avoids both bound targets' boxes inflated by 16 page px;
  - it has at most 4 bends;
  - ties go to fewer bends, then to the shorter path.

  It uses an A* search over the grid of candidate lines (the inflated boxes' edges and the ends'
  axes), with a bend penalty. The route is a pure function of the two ends and the two boxes.
- **Labels.** A label sits at the path's midpoint by length, on a background-coloured plate.

## 6. Derived layout

### 6.1 Groups

A group's box is the bounds of its children in the group's parent space. Moving or rotating a
group moves or rotates its children. Resizing a group scales its children's boxes, but not their
stroke widths or font sizes.

### 6.2 Connectors

When a bound target changes, every connector bound to it is re-routed in the same transaction.
Moving a connector alone unbinds a bound end only when that end's handle is dragged off the
target.

### 6.3 Auto-layout frames

- **Placement.** Children are placed in index order, along `dir`, with `gap` and `padding`. They
  are aligned on the cross axis by `align`, and wrap into new lines when `wrap` is set and the
  frame's main size is exceeded.
- **Sizing.** The frame hugs its content: its size is the content's size plus padding. A
  resize of an auto-layout frame in v1 changes only the wrap width.
- **Dragging a child out.** Dragging a child out of an auto-layout frame removes it from the
  layout when the pointer leaves the frame's body.
- **Dragging a shape in.** Dragging a shape into one inserts it at the index nearest the pointer
  along the main axis. The siblings make room during the drag (§9.2).

## 7. Camera

```ts
interface Camera { readonly x: number; readonly y: number; readonly z: number } // screen = (page + (x, y)) · z
```

- **Zoom range.** `z` is in [0.1, 8].
- **Zoom about a point.** Zooming keeps the page point under the screen point fixed.
- **Wheel and pinch:**
  - a plain wheel pans by its deltas (trackpad two-finger scroll), with line and page delta modes
    converted at 16 px per line and one canvas height per page, and Shift swapping the axes for a
    line-mode wheel;
  - Ctrl or Meta with the wheel, which is also the browser's pinch, zooms by `exp(−deltaY / 100)`
    about the pointer;
  - Safari's `gesturechange` zooms by its scale about its centre.
- **Space, middle button or the hand tool** drags pan 1:1.
- **Keyboard zoom.** Zoom steps for `+` and `−` are 0.1, 0.25, 0.5, 1, 2, 4 and 8 (the next step
  in each direction). Shift+0 zooms to 100%, Shift+1 fits all and Shift+2 fits the selection.
  Fitting uses a margin of 64 screen px and caps at z = 1 for a fit to all.
- **Animated changes.** Zoom-to-fit, zoom-to-selection and the zoom buttons animate the camera
  with an `ani-core` spring (response 0.3 s, damping ratio 1) on `x`, `y` and `log z`. Direct
  input interrupts them at once. Under reduced motion they jump.
- **Rendering.** The camera is applied as one CSS transform on the world layer. Pan and zoom
  write only that transform, the grid's background offset and size, and the overlay positions.
- **Screen-space overlay.** The overlay (selection outlines, handles, guides, marquee, connector
  handles) is drawn in screen space, so lines stay 1 screen px and handles stay 8 × 8 screen px
  at every zoom.

## 8. Input and tools

### 8.1 Input normalization

- The canvas element listens for pointer events with pointer capture, plus `wheel`, `gesture*`
  and keyboard events. It produces `InputEvent` records:
  - page and screen points;
  - buttons and modifiers;
  - pressure;
  - `pointerType`;
  - `timeStamp`.
- `touch-action: none` is set on the canvas.
- Only the primary pointer drives a tool. A second touch pointer turns the gesture into a
  pinch-zoom-pan.
- A drag starts after 3 screen px of travel (6 for touch). Below that it is a click.
- `pointercancel` and `lostpointercapture` cancel the gesture: its merged changes are reverted
  (§4.2).
- Escape cancels a gesture in progress, then exits editing, then clears the selection, then leaves
  the entered group.

### 8.2 Tools

Each tool is a state machine on the store and camera. It is pure and driven by `InputEvent`s in
tests.

| Tool | Key | States |
|---|---|---|
| Select | V | idle, pointing shape, pointing handle, translating, resizing, rotating, marquee, editing text, dragging connector end |
| Hand | H | idle, panning |
| Rectangle, Ellipse, Diamond, Triangle | R, O, D, — | idle, creating (drag sets the box; click creates the default 160 × 100 centred on the point) |
| Sticky | N | idle; click places a 200 × 200 note and starts editing |
| Text | T | idle; click places a text shape and starts editing; drag sets its wrap width |
| Frame | F | idle, creating; F with a selection wraps it in a fitting frame |
| Line, Arrow | L, A | idle, creating; binds to a shape under either end (§5.5) |
| Pen | P | idle, drawing |
| Image | Shift+I (file picker), or paste and drop | — |

- After creating a shape, the tool returns to Select unless the tool was locked (Q, or a
  double-click on the toolbar button).
- **Translating** moves the selection's top-level shapes by the snapped pointer delta:
  - Shift constrains to the dominant axis;
  - Alt at start duplicates the selection and moves the copies.
- **Resizing** with a corner or edge handle:
  - Shift keeps the aspect ratio (always on for images and groups);
  - Alt resizes about the centre;
  - crossing over the opposite edge flips the box. A flip mirrors a pen stroke's points and a
    connector's points, and keeps text upright.
- **Rotating.** The rotate handles are the 16 screen px zones just outside each corner.
- **Nudge.** The arrow keys move the selection by 1 page px, and Shift+arrow by 10. A run of
  nudges within 500 ms is one history entry.

### 8.3 Keyboard map

| Keys | Action |
|---|---|
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Cmd/Ctrl+Y | Undo, redo |
| Cmd/Ctrl+C, X, V, D | Copy, cut, paste, duplicate (+16, +16 page px) |
| Cmd/Ctrl+A, Escape | Select all (in the entered group or the root), cancel (§8.1) |
| Delete, Backspace | Delete the selection |
| Cmd/Ctrl+G, Shift+Cmd/Ctrl+G | Group, ungroup |
| Shift+Cmd/Ctrl+L, Shift+Cmd/Ctrl+H | Lock or unlock, hide or show |
| ], [, Cmd/Ctrl+], Cmd/Ctrl+[ | Bring forward, send backward, bring to front, send to back |
| Alt+A, D, W, S, H, V | Align left, right, top, bottom, horizontal centres, vertical centres |
| Alt+Shift+H, V | Distribute horizontally, vertically |
| Alt+Shift+T | Tidy up (§9.1) |
| Enter, F2 | Edit the text of the single selected shape; enter a selected group |
| Tab, Shift+Tab | Select the next or previous shape in reading order (top to bottom, then left to right, by page bounds' top-left) |
| Cmd/Ctrl+E, Shift+Cmd/Ctrl+E | Export dialog, export selection as PNG |
| ? | Shortcuts dialog |

Keys go to the canvas only when focus is on the canvas or the body. Text inputs and the text
editor keep their own keys.

## 9. Motion (ani-layout)

Motion explains change: it never delays input and never stands in for missing feedback. Direct
manipulation is never animated: a dragged, resized or rotated shape is exactly under the pointer
on every frame.

### 9.1 What animates

| Change | Motion | Engine |
|---|---|---|
| Undo or redo | Every shape whose page box changed flies from its old box to its new one; shapes created by the undo or redo enter, deleted ones exit | layout, spring (response 0.35 s, damping ratio 0.86) |
| Align, distribute, tidy up | The moved shapes fly to their new boxes | layout, spring as above |
| Auto-layout reflow (insert, remove, reorder, gap or padding change) | Siblings fly to their new slots | layout, spring as above |
| Drop into an auto-layout frame | The dropped shape is released through the drive seam with the pointer's velocity and settles into its slot | drive seam (§9.2) |
| Paste, duplicate, create from the context menu | Enter: opacity 0 → 1 and scale 0.96 → 1 | presence, spring (response 0.25 s, damping ratio 1) |
| Delete | Exit: opacity 1 → 0 and scale 1 → 0.96 | presence, timing 0.16 s ease-out |
| Layers panel reorder | The rows fly to their new positions; the dragged row is driven through the drive seam | layout and drive seam |
| Zoom buttons, fit, zoom to selection | The camera springs (§7) | ani-core |

- **Undo of a drag.** A drag's undo flies the shapes back, because the user did not perform the
  reverse motion. A drag itself never flies: its commit is at the pointer.
- **Connectors.** A connector bound to a flying shape is re-routed on every frame from the drawn
  boxes of its targets, so it stays attached. It does not fly on its own.
- **Interruption.** Every motion is interruptible. A new change during a flight retargets from
  the presented box and velocity (layout v3's measured keep and retarget). A gesture that starts
  on a flying shape catches it where it is drawn (`take`) with no jump.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, or the app's "Reduce motion"
  setting, every motion is replaced by its end state in the same frame: layout's reduced-motion
  rules, presence without motion, a camera jump.

### 9.2 Integration

- **The world layer** is one element transformed by the camera, and the shapes are its
  descendants.
  - Layout participants are the shape elements, each with `layoutKey: shape.id`.
  - A shape's element is positioned by `left`/`top`/`width`/`height` in parent space, with
    `rotate` from the model.
  - Rotated shapes are not layout participants in v1 (layout's support check requires an
    axis-aligned map): their changes are drawn at once, with no motion.
- **Camera during a flight.** A camera change during a flight moves the whole world uniformly.
  Layout plans in view space and writes local poses, so the flight stays on its track relative to
  the world: the drawn box is the camera applied to the track. Row B-MOT-6 proves it.
- **One vanilla layout group.** `motion/` owns one `createLayoutGroup` for the world. It is not
  the React adapter's `useLayout`, which animates every commit that renders a participant.
  - Shape elements register through a ref callback: `group.add(element, { layoutKey: shape.id })`,
    and the returned function on unmount.
  - Layout animates only the commits that `motion/` marks. A §9.1 change is applied as
    `group.update(() => flushSync(apply))`. Every other store change is applied without a
    capture, so it draws at once.
  - **A direct change to a flying shape.** If an unmarked change alters the box of a shape with a
    live flight, `group.finish()` runs first: every flight jumps to its end, then the change
    applies. A flight never continues over a box that changed under it. A gesture on a flying
    shape is not such a change: it catches the shape with `take` (below).
  - **Presence.** Enter and exit use layout's presence on the same scope (layout §6). The P7 helper
    reports the exact wiring, and this section is amended with it.
- **The drive seam (P4):**
  - **Taking.** Dragging a child of an auto-layout frame, or a row of the layers panel, takes its
    element with `take`. Pointer deltas in screen px are passed to `move` as view-space offsets,
    which is 1:1 under the pointer at every zoom.
  - **Room-making.** The siblings' room-making reflow is a layout commit.
  - **Release.** On drop, `release(velocity)` hands back with the gesture's velocity, estimated
    over the last 80 ms of pointer samples by least squares.
  - **Cancel.** A cancel (Escape, `pointercancel`) calls `cancel()`, and the shape returns to its
    slot.

## 10. Persistence and files

### 10.1 Autosave

- **Storage.** IndexedDB database `ani-board`, version 1, with stores `boards` (key: document id;
  value: the serialized document and its camera) and `meta` (key: `'library'`; the list of
  boards with `name`, `updatedAt` and a 160 px wide PNG thumbnail).
- **When it saves.** 500 ms after the last committed change, on `visibilitychange` to hidden, and
  on `pagehide`.
- **Order.** Saves are serialized, and a newer document supersedes a queued save.
- **Load.** The app opens the last board. A board whose record fails validation is not loaded.
  The app shows a recovery dialog that offers to export the raw record as JSON, then opens a new
  board. Nothing is overwritten.
- **Storage errors.** A save that fails (for example, a quota error) shows a persistent banner
  with an "Export JSON" action, and retries on the next change.

### 10.2 JSON

```ts
interface BoardFile {
  readonly format: 'ani-board'
  readonly schema: 1
  readonly document: SerializedDocument   // records as arrays, in id order
}
```

- Export writes `BoardFile` with 2-space indentation.
- Import validates the whole file (format, schema, every record, the §3.4 invariants) and opens it
  as a new board. An invalid file is rejected with the first error's path. A schema other than 1
  is rejected.
- Round trip: `import(export(doc))` deep-equals `doc`.

### 10.3 SVG and PNG

- **SVG.** One `<svg>` with a `viewBox` of the content bounds plus 32 page px padding (or the
  selection's bounds).
  - Shapes, connectors and pen strokes become SVG elements with resolved theme colours (the light
    theme, unless "export in dark" is chosen).
  - Text becomes `<text>` with one `<tspan>` per line, using the line breaks the DOM measured.
  - Images are embedded as data URLs.
- **PNG.** The SVG rasterized on a canvas at scale 1, 2 or 3 (default 2), with a transparent or
  theme background.
- **Clipboard export.** "Copy as PNG" writes `image/png` to the clipboard.

### 10.4 Clipboard

- **Copy** writes three formats:
  - `text/plain`: the shapes' texts, joined by line breaks;
  - `text/html`: a `<div data-ani-board="…">` holding the selection as a `BoardFile` fragment,
    base64 encoded;
  - `image/svg+xml`, where the browser allows it.
- **Paste** uses the first matching form:
  - board data: the shapes are pasted with new ids and their bindings remapped. They are placed
    at the same page position when it is visible, otherwise centred in the viewport;
  - an image file: an image shape with a new asset, downscaled to at most 4,096 px on its long
    side, and rejected above 20 MB;
  - plain text: a text shape.
- **Drop.** Dropping image files or a board JSON file onto the canvas does the same at the drop
  point.

## 11. User interface

- **Layout.**
  - The toolbar is centred at the bottom.
  - The styles panel is on the right; it appears with a selection, and shows the tool's defaults
    otherwise.
  - The layers panel is on the left and collapsible.
  - The zoom controls and minimap are at the bottom right.
  - The menu (boards, import, export, theme, reduce motion, shortcuts) is at the top left.
- **Styles panel.**
  - It shows the selection's common values, and a mixed state where they differ.
  - Each control writes one history entry. A slider drag is one gesture.
- **Context menu.** It opens on right-click or Shift+F10, with the selection's actions, their
  shortcuts and enabled states.
- **Minimap.**
  - It shows the bounds of all shapes and the viewport rectangle.
  - Clicking centres the camera there; dragging the rectangle pans.
  - It redraws on a throttle of one animation frame.
- **Themes.** Light and dark, following `prefers-color-scheme` until set in the menu. All colours
  come from tokens, and contrast meets WCAG 2.2 AA for UI text and controls.
- **Feedback.**
  - Hover outlines a hittable shape, at 1 screen px in the accent colour.
  - The cursor reflects the hit and the active tool: resize cursors rotated with the shape, and a
    rotate cursor.
  - Every action without a visible effect (for example, copy) shows a 2 s toast.

## 12. Accessibility

- The canvas is a focusable `role="application"` with `aria-roledescription="board"` and a label
  naming the board.
- **Announcements.** A polite live region announces selection changes ("Rectangle 3, 160 by 100,
  selected"; "4 shapes selected"), creation, deletion, undo and redo ("Undid move"), and zoom
  ("Zoom 200%").
- **Keyboard completeness.** Every operation in §8.3 works with the keyboard alone:
  - Tab selects shapes;
  - the arrow keys nudge;
  - Enter edits text;
  - the context menu has a key binding;
  - every panel control is reachable and labelled.
- **Focus.** Focus is never moved by motion. Dialogs trap focus and restore it.
- **Reduced motion** is described in §9.1.

## 13. Performance

- Pan and zoom write only the camera transform, the grid background and the overlay: no shape
  component renders.
- Each shape element has `contain: layout style paint`.
- **Gates** (Chromium and WebKit, release build, 1,000 mixed shapes and 200 connectors, the
  reference environment of layout §11.5):

| Interaction | Gate |
|---|---|
| Pan and zoom frame, script | p95 ≤ 4 ms |
| Dragging 50 selected shapes, frame script | p95 ≤ 8 ms |
| Undo of a 100-shape align with motion, commit | ≤ 16 ms; then frames p95 ≤ 4 ms |
| Load of a 1,000-shape board from IndexedDB to first paint | ≤ 500 ms |
| Hit test at the pointer | ≤ 0.2 ms |

## 14. Acceptance

Tests are written first for every row. A row passes only when its exact assertions hold. A
visible-only or no-crash check counts for nothing.

| Row | Level | Assertion |
|---|---|---|
| B-MODEL-1 | unit | Validator: every §3.4 invariant has a passing and a failing case; a rejected transaction leaves the store identical |
| B-MODEL-2 | unit, property | `between(a, b)` is strictly between, for 10,000 random pairs and 1,000 sequential inserts at each end and in the middle; keys stay ≤ 2 + log₆₂ n characters for appends |
| B-HIST-1 | unit, property | For random transaction sequences (put, update, remove, bind, group, reparent), undo to the start equals the initial document, and redo to the end equals the final one |
| B-HIST-2 | unit | A gesture is one entry; cancel and undo-during-gesture restore the pre-gesture state; the 500-entry cap |
| B-GEO-1 | unit | Hit tests per shape type on hand-computed points, rotated and nested; marquee contain and intersect |
| B-GEO-2 | unit | Snapping: candidate choice, tie order, threshold at zoom 0.25, 1 and 4, guides |
| B-GEO-3 | unit, property | Elbow routes avoid inflated boxes and have ≤ 4 bends, with the minimal bend count for 2,000 random pairs, against a brute-force reference router |
| B-CAM-1 | unit | Zoom about a point keeps the page point fixed (1e-9); fit margins; clamping; wheel delta modes |
| B-TOOL-1 | unit | Each tool's state machine on scripted input: transitions, history entries, cancel |
| B-LAYOUT-1 | unit | Auto-layout placement for row, column, wrap, align and padding against hand-computed boxes |
| B-PERSIST-1 | integration (fake IndexedDB) | Autosave timing, serialization order, recovery path, quota failure banner |
| B-FILE-1 | unit | JSON round trip; import rejection with error paths |
| B-EXPORT-1 | integration | SVG output for a fixture board matches a reviewed snapshot; PNG dimensions per scale |
| B-CLIP-1 | e2e | Copy and paste within and across boards, id remapping, bindings, plain text and image paste |
| B-E2E-1 | e2e | Create every shape type with mouse and keyboard; move, resize, rotate, snap; undo and redo all |
| B-E2E-2 | e2e | Connectors bind, re-route on move, unbind on drag-off; label edit |
| B-E2E-3 | e2e | Frames and auto-layout: wrap, drop in, drag out, reflow |
| B-E2E-4 | e2e | Reload restores the board and camera; the board list; import and export |
| B-A11Y-1 | e2e | Keyboard-only session creates, selects, edits, aligns and deletes; live-region texts; axe scan with no violations at serious or critical level |
| B-MOT-1 | e2e, manual clock | Undo of an align: every frame of every moved shape on the layout oracle (0.5 px); connectors attached on every frame |
| B-MOT-2 | e2e, manual clock | Paste enter and delete exit match the presence specs frame by frame |
| B-MOT-3 | e2e, manual clock | Direct drag, resize and rotate: the shape is under the pointer on every frame (≤ 0.5 px); no layout run starts |
| B-MOT-4 | e2e, manual clock | Drop into an auto-layout frame: release velocity carried, siblings on the oracle, settle exact |
| B-MOT-5 | e2e | Reduced motion: every change in §9.1 lands in one frame |
| B-MOT-6 | e2e, manual clock | Pan and zoom during an undo flight: drawn boxes equal the camera applied to the track on every frame |
| B-PERF-1 | bench | The §13 gates on the layout bench harness (layout §11.5) |

## 15. Phases

| Phase | Contents |
|---|---|
| P6 core | §2–§8 except connectors' elbow router and auto-layout; selection; keyboard; persistence (§10.1, §10.2); rows B-MODEL, B-HIST, B-GEO-1, 2, B-CAM, B-TOOL, B-PERSIST, B-FILE, B-E2E-1, 4 |
| P7 motion | §5.5, §6, §9; rows B-GEO-3, B-LAYOUT, B-E2E-2, 3, B-MOT |
| P8 product | §10.3, §10.4, §11, §12, §13; rows B-EXPORT, B-CLIP, B-A11Y, B-PERF |
