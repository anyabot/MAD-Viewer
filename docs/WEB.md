# Frontend structure

## Modules

| path | role |
|---|---|
| `pages/_app.tsx` | Chakra provider, dark theme, `Layout` wrapper |
| `pages/index.tsx` | the only page — gallery: filters, skin list, hosts the viewer |
| `components/Layout.tsx` | header shell |
| `components/skinViewer.tsx` | the viewer (PixiJS + Spine, playback state machine) |
| `components/skinViewer/types.ts` | `Layout`/`StoreKey`/`PlayMode` types, archive naming, playback helpers, pan/zoom, pixel-scale math |
| `components/skinViewer/chrome.tsx` | overlay UI: icon buttons, dropdowns, store strip, layer panel |
| `components/skinViewer/interactions.ts` | scenario-driven scene playback: condition evaluator + section/trigger machine |
| `components/skinViewer/jiggle.ts` | home-screen spring physics for the rig's `_jigglers` |
| `lib/data.ts` | runtime JSON fetch + `SkinListEntry` |
| `lib/skinArchive.ts` | archive fetch → brotli → untar → `Map<name, Blob>` |

The app has a **single route**. There is no landing page: the gallery is what the
viewer is for, and an index page in front of it was one click of nothing.

The deployed app has one skin source: packed archives under `public/skins/`.
`NEXT_PUBLIC_BASE_PATH` prefixes Next.js assets, runtime JSON, and those archives
for GitHub project Pages. The deployment workflow derives it from the repository
name; local builds leave it empty.

## `SkinViewer` contract

```tsx
<SkinViewer
  skin="af_ch0009"          // asset key
  stores={['onestore','google']} // from skin_list.json; <2 hides the store strip
  store={store}             // controlled selection
  onStoreChange={setStore}
  height="70vh"
/>
```

`stores` must come from the index, not be guessed: it decides whether the viewer
requests `<skin>.tar.br` or `<skin>__<store>.tar.br`. `archiveName()` in
`skinViewer/types.ts` is the single place that mapping lives.

## Playback contexts

A rig appears in the game in more than one place, and those places are driven by
different things. The context selector exposes **Free play**, **Lobby**,
**Desire View**, **Desire Story**, **Affection View**, and **Affection Story**
when the current rig supports them. Internally `PlayMode` in `types.ts` keeps
the three runtime owners, and
**only one of them may drive track 0 at a time** — the manual `bodyAnim` effect
is gated on the mode for exactly that reason.

- **Free play** (`manual`, default) — a body-animation dropdown (track 0) and a
  face-expression dropdown (track 1), plus a loop toggle.
- **Lobby** (`home`) — the home-screen widget, which is driven **entirely
  by the skin prefab**. The player picks a *variation*; each variation is a
  self-contained base / bored / touch triple, and any touch plays that one touch
  clip. Variations are alternatives, not a sequence — nothing in the rig advances
  from one to the next. The rig's spring `_jigglers` are live **only here**: a
  touched bounding box selects its assigned jiggler, which is kicked along the
  bone-to-touch vector scaled by `strength`; exported `maxDistance` is not used. A
  toggle switches one-finger drag between
  panning and sending successive points to the selected box's jiggler.
The initial kick is handled on the canvas `pointerdown`, before pan/zoom
captures the gesture; Pixi's later `pointertap` is suppressed for that touch.
The pointer-down scan applies the current Lobby variation before choosing a
box, because desire rigs keep mutually exclusive open/close gizmos attached at
the same time. Inactive or alpha-hidden slot attachments are also excluded.
- **Desire/Affection View and Story** (`scene`) — two shapes, depending on the rig:
  - rigs with an extracted scenario table (desire) are **interactive**: touching
    the right spots unlocks the next stage;
  - Desire Story and Affection View/Story use extracted linear script beats;
  - pleasure rigs have no matching script and retain the numbered-clip fallback,
    where each click advances and a second dropdown picks among clip groups.

A toggle draws the touch regions as an overlay, coloured by what each one does.
It is available in both interactive Scene mode and Home mode; the Home overlay
is the same bounding-box map that selects lobby touch animations and jigglers.

**What a touch region does is decided by the content pipeline, not the client.**
Each region arrives pre-resolved to an effect — spring physics only, a dedicated
reaction clip, a region clip, or the generic reaction — and the viewer looks it
up. Do not reintroduce name matching here; region names follow at least three
different conventions and at least one region's name contradicts its actual
behaviour.

### Animation tracks

Three: **0 body, 1 face, 2 overlay**. A clip that keys only a small share of the
rig's bones animates a prop or an effect, not the character — played on track 0
it would leave every bone it does not key frozen in the previous clip's pose.
Those clips are classified per rig from the parsed skeleton (group names cannot
decide it — several namespaces hold both kinds) and layered on track 2 instead,
with their own dropdown. Only a track-0 one-shot completing counts as a return
to idle.

Manual body selection resets the skeleton to its setup pose first, so a clip
shows what it actually contains rather than a blend with whatever preceded it.
The driven modes do not, since there the clips are the game's own sequences.

Some overlay clips switch art **on** and never off, so their effect is meant to
accumulate — a scene that draws one stroke per touch, for instance. Spine
restores the setup attachment for a slot keyed only by an animation that is
mixing out, which erased each stroke as the next began, and no track setting
prevents it. The viewer therefore pins a completed overlay clip's end attachment
state and re-asserts it each frame; a clip that clears a slot still clears it,
because the pin is last-writer-wins rather than accumulate-forever.

### Home-screen jiggle

`jiggle.ts` turns the prefab's exported `_jigglers` into damped springs on the
rig's `gyro_*` bones. Those bones are not deformers — they are transform
constraint targets, and the constraint mixes are keyed by the home-screen clips,
which is why the effect exists only there. Offsets are added in Spine's
`beforeUpdateWorldTransforms` hook, the only point where a bone change survives
the applied animation and still reaches that frame's world transform.
The bounding box chooses which jiggler receives the touch. Exported
`maxDistance` is ignored; overlapping nearby jigglers are not activated
automatically. The full bone-to-touch vector drives the impulse; reducing it to
a unit direction makes the rig's constraint-mixed movement effectively invisible.
The browser input uses a small minimum kick and a 4× gain so a single click is
visible; longer drags still scale with their actual distance.

### Scene-script playback

Some scenes are authored as scenario scripts rather than described by the rig's
own metadata, and the pipeline extracts those into a per-rig interaction table
(`data/desire_interactions.json`). In `scene` mode that table **replaces** the
variation and region logic above:

- a *section* is one stage — an optional one-shot transition played on entry,
  then an idle loop, plus the touch triggers it arms and optional entry
  ambience gated on carried-over state;
- every trigger in the section is armed at once, each with an optional condition
  over the script's own variables. A touch runs the armed trigger for that box
  whose condition holds, plays its reaction — which can be a sequence of body
  clips and layered overlays, not just one clip — and applies its assignments.
  A drag mini-game box is stood in for by a tap;
- the idle timeout is a trigger of its own: after the section's delay it plays
  the wait clip and runs its conditional body, which can set variables and show
  overlays — in some scripts waiting is a required input for progression;
- the stage advances when the trigger that fired says so, or when the section's
  trailing gate condition becomes true. The advance waits for the last clip of
  the transition sequence to finish — switching immediately cuts it off;
- **a box the script does not bind in the current stage does nothing at all.**
  It must not fall through to a generic reaction: that plays a clip from a
  different staging context and visibly resets the pose;
- **input is blocked while a reaction sequence plays out**, as in game. A tap
  that interrupted a reaction consumed script state without showing its clip,
  and an overlay one-shot cut short before completing never pins its lasting
  art. Jiggle pokes stay live — the game's jiggler input is a separate handler.
- a trigger may explicitly declare slots that its completed body reaction
  removes permanently for that scene run. The viewer commits the removal only
  after the one-shot finishes, holds those slots at zero alpha across later
  idles and phase changes, and retires the spent touch box. Restarting the
  playback context restores the initial scene.

The table drives `scene` mode only. Firing its reaction clips on the home screen
would stage a scene pose in the widget's context, which is the same class of bug
as the unbound-box fall-through above.

The explicit View and Story contexts replace the old nested Scene variant.
Desire View combines the interaction table with `scene_timelines.json`, so
entering display/sections and firing triggers also plays the script's entry,
authored track/hold/reset state, waits, fades, and camera cues. Numeric and
variable track expressions are evaluated against the live script variables;
held one-shots preserve their final slot state while later body reactions keep
playing, and return to idle immediately; only slots keyed by the held clip are
retained until an authored reset clears that state. Reset commands re-enter a
section at the reset point even when the destination is the current section.
Desire Story and affection View/Story are linear visual beats. Their scene-loop
control autoplays through the authored waits and one-shot durations, wraps at
the end, and still permits a click to skip; turning it off restores manual
click-to-advance. Commands at one playback spot are queued rather than collapsed
into a guessed clip. The runtime preserves each script's one-shot/loop flag; it
does not force every affection animation to loop or add a generic crossfade.

An empty `@desire.wait` is a wait for the current desire animation to finish,
whereas a populated wait is a duration. This distinction is required for
transitions such as ch68: H1 completes before white covers the scene, then the
phase-3 script reveals it again. The scheduler follows the command's authored
Spine track (including ch10's track 50), not only body track 0.

Desire scene framing also samples the prefab's aspect-keyed `CutsceneOffset`
curve. It measures the original room/actor composition first, then applies the
authored position, rotation, and scale to a shared room/actor/touch-zone
container. Manual Free play continues to use ordinary fit framing.

Spine `bg_on`/`bg_off` events address that same white overlay, not the exported
room/background sprite. `bg_on` opens opaque white and `bg_off` clears white;
the background toggle remains independent. `bg_change` is not yet reproduced.

The **Follow game flow** toggle owns both the opening and scripted camera.
Disabled, a context skips its pre-dialogue/pre-label entry and opens directly
on the normal fitted model; camera cues are ignored, while manual pan/zoom stays
available. Enabled, playback restarts from the extracted entry, queues the
normal idle/first beat after it, and applies scenario offset/zoom cues as a 2D
orthographic transform relative to the fit. Screen and background-fade commands
still use a canvas overlay.

`interactions.ts` evaluates the conditions with a small hand-rolled parser rather
than `new Function`, so generated data never reaches `eval`. The viewer keeps no
invented thresholds.

### Advanced layers

Every rig has exactly one Spine skin (`default`), so there is no skin composition
to expose. What there *is* is the rig's slots, and the layer panel switches those
on and off individually or by group.

- The list is enumerated from the **skin**, not from the current pose, so a slot
  an attachment timeline fills later is still listed.
- Hiding zeroes the slot alpha every frame in the same Spine update hook the
  jiggle uses. Clearing the attachment instead would be lost on the next clip
  that keys it — and could not be put back.

Other controls: play/pause, reload (runs an authored section reset and
destination when available, otherwise remounts the Pixi app), save-as-PNG (renders
the stage into a `RenderTexture` at the art's native resolution, then
tight-crops), a background toggle for rigs that have one, and a camera action
menu. The camera menu fits/resets the stage or zooms around the viewport centre;
wheel/pinch zoom and drag-pan use the same transform.

## Conventions

- **Mobile-first.** `pages/index.tsx` is a single column on `base` (list above
  viewer) and two columns from `lg`. Chip rows use `Wrap`. Nothing may cause
  horizontal body scroll.
- **Overlay chrome is icon-only, with tooltips**, and every button carries an
  `aria-label` (the tooltip text) — the smoke test selects buttons by that label.
  The dropdowns are themed menus, not native `<select>` elements: a transparent
  native select left the open list to the platform, which meant a light popup on
  a dark overlay with no grouping and no room for a hint line. `MenuList` is
  portalled so the viewer's `overflow: hidden` cannot clip it, and scroll-capped
  so a 100-clip rig does not produce a list taller than the window.
- Chrome icons are inline SVG paths in `chrome.tsx`. No external icon assets and
  no game UI art are used.
- The viewer holds PixiJS/Spine objects in refs, never in state, and both
  libraries are dynamically imported inside the build effect so they stay out of
  the initial bundle.
