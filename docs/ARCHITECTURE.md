# Architecture

MAD Viewer is a static single-page app that renders Make Drama character art.
Nothing is server-rendered at request time and no game data is bundled into the
build: the app fetches a generated JSON index and per-skin asset archives at
runtime.

```
                      build time                     runtime
  ┌──────────────┐                     ┌──────────────────────────────┐
  │ local        │  skin_list.json     │  browser                     │
  │ pipeline     │ ───────────────────▶│   lib/data.ts      (index)   │
  │ (local-only, │  <skin>.tar.br      │   lib/skinArchive.ts (assets)│
  │  see below)  │ ───────────────────▶│   components/skinViewer.tsx  │
  └──────────────┘                     │     PixiJS v8 + Spine 4.2    │
                                       └──────────────────────────────┘
```

## Frontend

Next.js pages router with `output: 'export'`, Chakra UI v2 for the shell and
overlay chrome, PixiJS v8 + `@esotericsoftware/spine-pixi-v8` for rendering.
There is no global state store — the gallery owns its filter/selection state and
the viewer owns its playback state. See [WEB.md](WEB.md) for the module map.

Two data paths, both plain `fetch`:

- **Index** — `lib/data.ts` reads `skin_list.json` (which skins exist, and which
  store builds each one has). `NEXT_PUBLIC_DATA_SOURCE` selects a local
  `public/data/` copy or a remote base URL.
- **Assets** — `lib/skinArchive.ts` fetches `<skin>.tar.br`, decompresses it with
  a WASM brotli decoder, and untars it into `Map<filename, Blob>`. The viewer
  builds `blob:` URLs from that map. Brotli is used because no browser exposes a
  native decoder for it (`DecompressionStream` does not support brotli), and one
  solid archive per skin means one request instead of one per file.

## Rendering

Every skin is a Spine 4.2 rig with a **binary** skeleton, parsed with the
official runtime's `SkeletonBinary`. The Unity `SkeletonDataAsset` scale is
applied at parse time so the skeleton lands in Unity world units; the background
sprite is exported in those same units. Desire scene mode samples the exported
aspect-keyed offset, computes fit from the unmodified composition, then applies
the offset to a shared room/actor/touch-overlay container; manual modes use the
ordinary fit.

Drawers may contain an ordered background stack rather than one sprite. The
viewer keeps those layers in the shared scene container and uses targeted Spine
`bg_on`/`bg_off` payloads to switch authored pairs; untargeted events remain
screen-overlay cues.

Character expressions are separate animations rather than skins, so ordinary
playback uses body track 0 and face track 1. Scripted Desire playback can also
address authored numeric or variable Spine tracks directly; those extra tracks
are how persistent layered effects accumulate.

Each rig also carries prefab-level interaction metadata — the home-screen
variations it offers and the spring targets a touch can set off — which the
viewer reproduces rather than approximates. Desire archives additionally retain
their timestamped external-effect references, aspect-ratio staging curves,
camera fields, and silhouette post-process inputs; unsupported effects remain
data rather than being replaced by guesses. See [WEB.md](WEB.md) for the modes.

## Content pipeline (local-only)

A local toolchain downloads the game's asset bundles, extracts the Spine assets
and prefab metadata, compares the two store builds of each skin, packs approved
exports into archives, and generates the JSON index. It is deliberately kept out
of this repository's tracked files and is documented separately for the machine
that runs it.

The one architectural fact the frontend depends on: **a skin whose art differs
between store builds ships two archives** (`<skin>__onestore`, `<skin>__google`)
and the index advertises both stores for it; a skin that is identical ships one
un-suffixed archive and advertises a single store. The viewer's store switch is
an archive swap, not a texture swap, because the two builds have different
skeletons.

A second local step decodes the game's **scenario scripts** — some scenes are
authored as scripts rather than described by the rig's own metadata — into two
runtime sidecars. `data/desire_interactions.json` carries the desire-view state
machine; `data/scene_timelines.json` carries complete pre-label/pre-dialogue
entries and linear view/story visual beats, including authored animation loop
flags, track expressions, hold/reset state, waits, reset destinations, fades,
and camera cues. The viewer fetches both without changing archive contents. See
[WEB.md](WEB.md) for the runtime model.

## Deployment

The static export is deployed by GitHub Actions. `NEXT_PUBLIC_BASE_PATH` is
empty for a root `<user>.github.io` site and `/<repository>` for a project site;
the same prefix is used by Next.js chunks, runtime JSON, and packed skin
archives. `public/.nojekyll` preserves the `_next` directory on Pages.
