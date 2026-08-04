# MAD Viewer

A web viewer for **Make Drama** character art — Spine rigs for standing
portraits and affection scenes, with animation playback and a switch between the
two store builds for the skins whose art differs between them.

## Stack

Next.js (pages router, static export) · Chakra UI · PixiJS v8 ·
`@esotericsoftware/spine-pixi-v8`

No game data is bundled into the build. The app fetches a JSON index and one
compressed archive per skin at runtime.

## Running it

```bash
npm install
npm run dev              # http://localhost:3000
npm run build            # static export -> out/
```

The app needs generated content to display:

- `public/data/skin_list.json` — the gallery index
- `public/skins/<skin>.tar.br` — per-skin asset archives

Both are produced by a local content toolchain that is not part of this
repository. Point the app at an alternative host with `NEXT_PUBLIC_DATA_SOURCE`,
`NEXT_PUBLIC_DATA_BASE`, and `NEXT_PUBLIC_SKIN_ARCHIVE_BASE` — see
[`.env.example`](.env.example).

## GitHub Pages

Push the `main` branch to GitHub and select **GitHub Actions** as the Pages
source in the repository settings. The included workflow builds and deploys
`out/` automatically. It derives the correct `/<repository>/` base path for a
project site and uses no prefix for a `<user>.github.io` root site.

## Using the viewer

- **Body / face dropdowns** — pick animations directly. Expressions play on their
  own track over the body animation.
- **House button** — home-screen playback. The rig loops its base animation,
  plays its "bored" one after a while, and plays its touch animation when you
  click it. Rigs that offer several home variations get a variation dropdown, and
  a touch also springs the part you clicked.
- **Wand button** — the full-screen scene, for the rigs that have one: touch the
  right spots to unlock the next stage.
- **Hand button** — show the rig's touch regions.
- **Layers button** — advanced: turn the rig's individual slots on and off, one
  at a time or a whole group at once.
- **ONE / GP** — switch store build. Only appears for skins whose art actually
  differs; the gallery marks those `DIFF`.
- Mouse wheel zooms, drag pans, and the download button saves the current view as
  a PNG at the art's native resolution.
