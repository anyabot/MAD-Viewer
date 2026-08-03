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
Rig playback progress stays local to the viewer. Two small in-memory Zustand
stores hold list filters and cross-rig viewer controls, because Next.js remounts
the keyed viewer when a skin changes and unmounts pages on route changes. See
[WEB.md](WEB.md) for the module map.

Three routes, all reaching the same viewer: the skin gallery (`/`, by asset
key), the character list (`/characters`, by the game's own filter axes) and a
character page (`/character?code=CH####`). The character page takes its code
from the query string rather than a `[code]` route segment, because every route
must prerender at build time while the character set itself is runtime data.

Two data paths, both plain `fetch`:

- **Index** — `lib/data.ts` reads `skin_list.json` (which skins exist, and which
  store builds each one has), plus `characters.json` (names and profile facts),
  `icons.json` (which icon art was published) and the two scenario sidecars.
  `NEXT_PUBLIC_DATA_SOURCE` selects a local `public/data/` copy or a remote base
  URL. Everything except `skin_list.json` is decoration: a failed fetch must
  leave the page usable.
- **Assets** — `lib/skinArchive.ts` fetches `<skin>.tar.br`, decompresses it with
  a WASM brotli decoder, and untars it into `Map<filename, Blob>`. The viewer
  builds `blob:` URLs from that map. Brotli is used because no browser exposes a
  native decoder for it (`DecompressionStream` does not support brotli), and one
  solid archive per skin means one request instead of one per file.
- **Audio** — character voice, authored scene animation sounds and BGM are
  Opus clips fetched on demand through independent viewer controls.

The archives and audio clips are far larger than a repository should hold,
so they are served from a CDN. `lib/cdn.ts` resolves each one through
`public/data/cdn.json`, a manifest naming which bucket repository holds which
asset; the site's own `public/skins/` copy stays as a fallback candidate, so a
missing or stale manifest degrades to a slower load rather than a broken
gallery. See the pipeline section below.

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

The same toolchain also publishes the game's own **icon art** — element, role,
position, division and faction marks, character portraits and cut-ins, and
per-skin thumbnails — as WebP under `public/icons/`, with `public/data/icons.json`
listing what exists. The frontend never probes for an icon: it asks the
manifest, and renders nothing when the answer is no. That step is incremental
and reports only what changed, because the type art effectively never does.

A second local step decodes the game's **scenario scripts** — some scenes are
authored as scripts rather than described by the rig's own metadata — into two
runtime sidecars. `data/desire_interactions.json` carries the desire-view state
machine; `data/scene_timelines.json` carries complete pre-label/pre-dialogue
entries and linear view/story visual beats, including authored animation loop
flags, track expressions, hold/reset state, waits, reset destinations, fades,
camera cues, and BGM start/stop actions. The viewer fetches both without changing archive contents. See
[WEB.md](WEB.md) for the runtime model.

A third step publishes **character voice and the subtitles that go with it**.
The game voices two different surfaces two different ways, and both are decoded
into `public/data/voice.json`: the scenario scripts bind a spoken line to a clip
through a resource map rather than naming it inline, while the home-screen and
UI lines come from a master-data interaction table whose text is a small inline
script carrying the clip, the staging and the subtitle together. Clips are
re-encoded to Opus, because the shipped audio is in a container form no browser
plays. Only Japanese voice exists in the game.

The same audio stage extracts the scenario bundle's per-animation view sounds
and the BGM clips referenced by those timelines, publishes their clip/animation
map as `scene_audio.json`, and stages the binaries in a separate CDN family.

## Asset hosting

The packed archives, voice, and scene audio are hundreds of megabytes, so they are
not served from the site. A local step assigns each one to a **numbered bucket
repository** and stages a push-ready tree; the app resolves URLs through
`cdn.json`. Two rules keep those URLs cacheable: an asset is never moved to a
different bucket once assigned, and a bucket that gains content is republished
under a new tag rather than overwriting one already cached. New content fills
the current bucket until it reaches a size budget, then opens the next.

## Deployment

The static export is deployed by GitHub Actions. `NEXT_PUBLIC_BASE_PATH` is
empty for a root `<user>.github.io` site and `/<repository>` for a project site;
the same prefix is used by Next.js chunks, runtime JSON, and packed skin
archives. `public/.nojekyll` preserves the `_next` directory on Pages.
