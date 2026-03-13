# Pixel Asset Layout

This package keeps pixel assets in two separate roots:

## Runtime Assets

`public/pixel-assets/`

Use this tree for files that the React app and the future Pixi workshop can load directly at runtime.

The runtime tree should mirror the same folder shape used under `assets-src/` whenever possible. That means:

- if source art lives in `assets-src/characters/workers/worker-00/...`
  the exported runtime files should live in `public/pixel-assets/characters/workers/worker-00/...`
- if a prop lives in `assets-src/environment/props/furniture/sofa.png`
  the runtime file should live in `public/pixel-assets/environment/props/furniture/sofa.png`
- if a background lives in `assets-src/environment/backgrounds/idle/idle.png`
  the runtime file should live in `public/pixel-assets/environment/backgrounds/idle/idle.png`

This mirrored structure keeps runtime paths predictable and avoids having one naming system for source art and a different one for shipped assets.

## Source Assets

`assets-src/`

Use this tree for authoring files and non-runtime source material. This is where raw exports, layered art, mockups, or work files should live before they are packed into runtime-ready files.

## Working Rule

- Put only app-loadable outputs in `public/pixel-assets/`
- Put editable source material in `assets-src/`
- Keep `public/pixel-assets/` structurally aligned with `assets-src/`
- When a runtime spritesheet is regenerated, keep the source file in `assets-src/` and export the runtime file to the mirrored path in `public/pixel-assets/`
