# AgentTown Phase 3 Research

## Goal

Phase 3 should turn the current Workshop from a dashboard into a pixel-style interactive world without changing the core product contract:

- the daemon remains the source of truth for worker business state
- the frontend remains responsible for visual mapping and interaction
- clicking a worker still opens `#/terminal/:sessionId`
- the world view should work in both web and future desktop packaging

This document captures the Phase 3 technical direction, layout recommendation, and pathfinding model. `ROADMAP.md` should remain the high-level checklist.

## Product Constraints

- The world must preserve the current four-state model: `idle`, `working`, `approval`, `attention`
- The first version should optimize for readability and stable interaction, not rich action variety
- Mobile screens must be treated as a first-class target, so the whole world cannot assume a very wide horizontal layout
- Cross-zone movement must be visually understandable; users should not mistake "passing through" for "changing into" an intermediate state
- The world runtime should stay mounted and reuse resources instead of being rebuilt on every route change

## Recommended World Layout

### Decision

The first playable layout should use a `2x2` zone arrangement with a central public transit layer.

Recommended arrangement:

- top-left: `Idle`
- top-right: `Working`
- bottom-left: `Attention`
- bottom-right: `Approval`
- center: shared public road / plaza / crossroad

This is preferable to a pure horizontal four-zone strip because it fits mobile screens better, shortens travel distance, and keeps all state areas visible within a compact frame.

### Why Not a Pure Horizontal Strip

If the world is arranged as `Idle -> Working -> Attention -> Approval`, a worker moving from `Idle` to `Approval` would visually cross multiple business areas. That creates avoidable ambiguity:

- the user may think the worker briefly entered `Working`
- the user may think the worker changed into `Attention` during transit
- long left-to-right travel time makes the state transition feel noisy instead of intentional

For this product, movement should explain state, not blur it.

### Transit Layer

Zones should not connect through each other's interior tiles. They should connect through a dedicated public transit layer:

- a horizontal road linking left and right
- a vertical road linking top and bottom
- a central hub where paths merge
- one or two controlled entry points per zone

The road should be visually distinct but not empty white space. A light stone or tile path is a better fit than a flat white rectangle.

## Zone Semantics

Each zone should have a narrow semantic role:

- `Idle`: rest area, waiting area, sleeping or sitting posture
- `Working`: desk area, computer-facing posture, main production space
- `Attention`: issue-handling area, red exclamation marker, urgent but not blocked by explicit approval
- `Approval`: explicit help-request area, readable `Help` sign, strongest blocked-state signal

Workers should only play their final state performance after reaching the target anchor in the target zone.

## Pathfinding Direction

### Core Decision

The first implementation should not use unrestricted full-map pathfinding as the primary behavior model. It should use layered pathfinding:

1. high-level routing across zones
2. local pathfinding within a zone or road segment

This keeps behavior readable and makes movement match product semantics.

### Recommended Routing Model

Treat the world as connected navigation regions:

- `idle-zone`
- `working-zone`
- `attention-zone`
- `approval-zone`
- `road-zone`

Each region owns:

- walkable tiles
- one or two entry portals
- anchor points
- optional furniture occupancy points

When a worker changes target state, do not compute one global path from current tile to destination tile. Instead, build a route in segments:

1. current position -> current zone portal
2. current zone portal -> road hub
3. road hub -> target zone portal
4. target zone portal -> target anchor

For example:

- `Idle -> Approval` becomes `idle anchor -> idle portal -> road hub -> approval portal -> approval anchor`
- `Working -> Attention` becomes `working anchor -> working portal -> road hub -> attention portal -> attention anchor`

### Why This Is Better

- users can read the intent immediately: the worker is leaving one place and going to another
- workers never appear to "pass through" another business state
- zone entry and exit become consistent and predictable
- performance is easier to control than global freeform navigation
- the map can evolve without rewriting the whole navigation model

### Low-Level Algorithm

The local segment solver can still use simple grid A*.

The important change is scope:

- run A* inside the current zone when leaving it
- run A* inside the road layer when traversing transit space
- run A* inside the destination zone when entering and settling

This is enough for Phase 3. There is no need for navmesh, steering behaviors, or complex crowd simulation in the first version.

## State and Animation Model

Business state and visual state should not be the same field.

A worker should track at least:

- `targetState`: the logical business destination, such as `approval`
- `travelPhase`: where it is in the move pipeline, such as `to-exit`, `to-road`, `to-zone`, `settling`
- `visualState`: what animation is currently playing, such as `walking`, `idle`, `working`, `approval`, `attention`

This avoids premature visual switching.

Rules:

- while moving, the worker uses `walking`
- after arriving at the target anchor, the worker switches to the final presentation state
- the system may optionally show a lightweight target hint during movement, but should not fully play the destination performance early

Example:

- if the backend changes a worker to `approval`, the frontend may immediately set `targetState=approval`
- the worker still visually walks until it reaches the `approval` anchor
- only then does the `Help` presentation appear

## Occupancy and Anti-Jitter Rules

State flips can create visual noise if workers keep changing direction or fighting for the same furniture tile. Phase 3 should include a small amount of presentation stability:

- anchor occupancy reservation
- target re-selection when the preferred anchor is busy
- a minimum hold time before re-routing out of a newly reached anchor
- cancellation of the previous path when the target genuinely changes

The goal is not realism. The goal is to stop workers from looking broken.

## Frontend Technical Direction

### Rendering

Use a hybrid frontend architecture:

- DOM keeps the app shell, route handling, filters, buttons, connection status, and terminal pages
- `PixiJS` handles the Workshop world, sprite composition, hit testing, and animation tick

This matches the current product shape and avoids unnecessary rewrites.

### World Lifecycle

The Workshop world should behave like a long-lived runtime:

- initialize once
- cache textures and entity state
- pause or reduce ticker frequency when hidden
- resume when the Workshop becomes visible again
- do not destroy and recreate the world on every route transition

### Entity Model

A worker entity should own:

- `sessionId`
- short display name
- current zone
- target state
- visual state
- tile position
- path queue
- current anchor
- sprite references for body, marker, and name label

`sessionId` remains the only routing identifier for terminal handoff.

## Interaction Direction

The canvas layer should support only a minimal interaction contract in the first version:

- hover highlight when possible
- stable hitbox for tapping on mobile
- name label rendered as part of the entity, not detached DOM
- click or tap opens the existing terminal route

The world should not attempt custom terminal overlays, drag interactions, or in-canvas management menus in the first version.

## Mobile Considerations

The `2x2 + central road` layout is the current recommended baseline because it compresses the world without making zones too thin.

Mobile-specific guidance:

- avoid wide panoramic layouts
- keep each zone visually distinct using floor pattern and furniture silhouette, not text-heavy UI
- keep the road width large enough for tap clarity and readable travel arcs
- prefer a fixed camera for the first version instead of panning around a larger map
- keep the full world visible on most phone screens, even if decorative padding must be reduced

## Asset Pipeline Direction

Phase 3 should keep the asset strategy intentionally small.

Primary recommendation:

- use `PixelLab` first for the initial worker character and motion set
- validate only the minimum state set: `walk`, `idle`, `working`, `approval`, `attention`
- export spritesheets for frontend use

Fallback recommendation if consistency or export control is insufficient:

- low-poly humanoid base
- motion from `Mixamo`
- fixed-angle render in `Blender` or equivalent
- cleanup and atlas assembly in `Pixelorama`

The first milestone should target:

- 1 to 2 worker variants
- 5 state animations
- 1 minimal furniture atlas
- 1 minimal effects set for `Help`, exclamation, and monitor flicker

## Asset Source Organization

### Core Principle

Asset files are categorized by **what they are**, not by **where they are placed** in the world. Zone placement and furniture coordinates belong in the game's scene configuration in code, not in the file directory structure.

### PixelLab Export Format

PixelLab exports a self-contained folder per character with the following structure:

```
{character-id}/
  metadata.json          ← character info, all frame paths, per-frame bone keypoints
  rotations/             ← 8-direction static reference poses (standing still)
  animations/
    {action}/
      {direction}/       ← south, east, west, north
        frame_000.png
        ...
```

Key distinctions:

- `rotations/` — 8 static directional poses, used when a character is standing still and facing a direction. Used as plain `Sprite` in PixiJS.
- `animations/` — multi-frame sequences per action per direction. Used as `AnimatedSprite` in PixiJS.
- `metadata.json` — preserves the full frame manifest and bone keypoints. Keypoints are not needed in Phase 3 but are useful later for attaching props to hand positions or aligning name labels above the head.

Each new animation exported from PixelLab for the same character is merged into the same character folder under `animations/`.

### Source Directory Layout

```
assets-src/
├── _design/
│   └── mockups/           ← complete scene previews for visual validation only, never loaded at runtime
│
├── characters/
│   └── workers/
│       └── worker-00/     ← one folder per character variant, named sequentially
│           ├── metadata.json
│           ├── rotations/  ← 8-direction static frames from PixelLab
│           └── animations/
│               ├── walk/   ← 4 directions × N frames
│               ├── idle/
│               ├── working/
│               ├── approval/
│               └── attention/
│
├── environment/
│   ├── backgrounds/       ← one static background image per zone (floor scene, no props)
│   └── props/
│       ├── furniture/     ← tables, chairs, sofas, mats
│       ├── signs/         ← Help board, zone identifier signs
│       ├── decals/        ← floor markings, footprints, hazard stripes
│       └── structures/    ← pillars, partition walls, counter edges
│
├── fx/                    ← effect frame sequences (exclamation bubble, ZZZ, screen glow)
├── ui/                    ← name label plate and other HUD elements
├── palettes/              ← color palette reference files
└── fonts/                 ← pixel font source files
```

### Rendering Layers and Why They Are Separate

PixiJS renders the world as stacked containers. Each layer type requires a different kind of source asset:

```
Layer 0 — backgrounds    ← one Sprite per zone, static, never changes
Layer 1 — props          ← individual Sprites at fixed coordinates from scene config
Layer 2 — characters     ← AnimatedSprites that move and change state
Layer 3 — fx / UI        ← exclamation bubbles, ZZZ, name labels
```

Because these layers are independent at runtime, their source assets must also be independent files. A background cannot include furniture baked in, because furniture needs to be a separate Sprite to cast shadows correctly, accept pointer events, and allow the character to walk in front of or behind it based on y-sorting.

### Zone Background vs Tilemap

For Phase 3's small fixed-camera world, zone backgrounds are generated as **single complete images** per zone rather than repeating tile patterns. There is no scrolling map, so a tilemap system adds complexity with no benefit.

Each zone background is generated in PixelLab as a complete room floor view without any furniture or characters. Furniture is placed on top via scene configuration at runtime.

The road and plaza area follows the same rule: one or a few static images for the transit layer, not a tile grid.

### Zone Placement Lives in Code

Which furniture appears in which zone, and at which pixel coordinates, is defined in the scene configuration in JavaScript, not in the file directory:

```js
const zoneLayout = {
  idle: {
    background: 'backgrounds/idle-zone',
    props: [
      { texture: 'furniture/sofa',    x: 40, y: 60 },
      { texture: 'furniture/beanbag', x: 90, y: 80 },
    ]
  },
  working: {
    background: 'backgrounds/working-zone',
    props: [
      { texture: 'furniture/desk',    x: 30, y: 40 },
    ]
  }
}
```

This means the same furniture texture can appear in multiple zones without duplicating files, and zone layouts can be adjusted without touching the asset directory.

### Build Output

A build script reads `assets-src`, packs frames into PixiJS-compatible spritesheets, and writes to `assets/`:

```
assets/
├── characters/
│   ├── worker-00.png      ← packed atlas (all rotations + all animation frames)
│   └── worker-00.json     ← PixiJS spritesheet descriptor with named frames and animation arrays
├── environment/
│   ├── backgrounds.png    ← all zone backgrounds packed together
│   ├── backgrounds.json
│   ├── props.png          ← all props packed together
│   └── props.json
├── fx/
│   ├── fx-atlas.png
│   └── fx-atlas.json
└── ui/
    ├── ui-atlas.png
    └── ui-atlas.json
```

Frame naming convention in the packed atlas follows the source path relative to the category root:

```
characters:    walk/south/0   walk/south/1   rotations/south   rotations/north-east
backgrounds:   idle-zone      working-zone   road
props:         furniture/sofa   signs/help-board   decals/footprints
```

### Design Reference Files

The `_design/mockups/` folder holds complete scene images generated in PixelLab that show a full zone view with floor, furniture, and style together. These are used to validate the visual direction before generating individual assets. They are never loaded at runtime and are not part of the build pipeline.

## Phase 3 Working Recommendation

The current implementation direction should be:

1. keep `ROADMAP.md` as checklist only
2. build Phase 3 against a `2x2 + central road` world layout
3. implement layered routing instead of unrestricted global pathfinding
4. separate `targetState` from `visualState`
5. optimize the first version for clarity, stability, and mobile fit

## Open Questions

- whether `Attention` and `Approval` should swap corners after visual mockups
- whether movement should always route through the central hub, or allow direct road-edge shortcuts later
- whether target hints during walking improve clarity or create noise
- whether the first version should support camera scaling presets for phone portrait vs desktop

## Suggested Follow-Up Documents

If Phase 3 moves into implementation planning, the next documents should be split by concern instead of extending `ROADMAP.md`:

- world scene data model
- entity/state sync contract
- asset naming and atlas convention
- Pixi runtime lifecycle and route integration
- mobile layout and hit-area rules
