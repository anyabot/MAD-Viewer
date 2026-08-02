# Frontend structure

## Modules

| path | role |
|---|---|
| `pages/_app.tsx` | Chakra provider, dark theme, `Layout` wrapper |
| `pages/index.tsx` | skin gallery: filters, skin list, hosts the viewer |
| `pages/characters.tsx` | character list: the game's own filter axes, drawn with its icons |
| `pages/character.tsx` | one character: infobox + that character's skins in the viewer |
| `components/Layout.tsx` | header shell and the two-tab nav |
| `components/gameIcon.tsx` | `GameIcon` / `StarRating` — renders published icon art, or nothing |
| `lib/characters.ts` | shared reads over the master data: type rows, skin icons, grouping |
| `lib/icons.ts` | icon URLs and manifest-backed existence checks |
| `lib/filterStore.ts` | Zustand store keeping list filters across route changes |
| `components/skinViewer.tsx` | the viewer (PixiJS + Spine, playback state machine) |
| `components/skinViewer/types.ts` | `Layout`/`StoreKey`/`PlayMode` types, archive naming, playback helpers, pan/zoom, pixel-scale math |
| `components/skinViewer/chrome.tsx` | overlay UI: icon buttons, dropdowns, store strip, layer panel |
| `components/skinViewer/interactions.ts` | scenario-driven scene playback: condition evaluator + section/trigger machine |
| `components/skinViewer/jiggle.ts` | home-screen spring physics for the rig's `_jigglers` |
| `lib/data.ts` | runtime JSON fetch + `SkinListEntry`, `CharacterEntry` |
| `lib/skinArchive.ts` | archive fetch → brotli → untar → `Map<name, Blob>` |

## Routes

There is no landing page: every route reaches the viewer.

| route | what it lists |
|---|---|
| `/` | every skin archive, by asset key — the pipeline's own view |
| `/characters` | every character, filtered the way the game filters them |
| `/character?code=CH0001` | one character: infobox, its skins, the viewer |

The character page reads a **query parameter**, not a `[code]` route segment.
`output: 'export'` prerenders each route at build time, so a dynamic segment
would need a build-time path list — and the character set is runtime data whose
whole point is that adding a character requires no rebuild.

### Character names and profile facts

`data/characters.json` is `{characters, types}`. `characters` is keyed by the
same `CH####` code every `SkinListEntry.character` already carries; `types`
resolves each `*_type` integer to a display name, icon candidates and (elements
only) the colour the game tints it with.

Three populations, each on its own toggle in the character list:

| population | how it is identified | what it carries |
|---|---|---|
| playable (default) | `characterType` 1 | everything — rarity, types, birthday, profile card |
| NPC | `characterType` 2 | name and portrait; `division_type`/`faction_type` are `0`, a value no type table declares |
| unreleased | `unreleased: true` | a resources row and a standing prefab, no base row at all |

An unresolvable type must render as **absent, not as an error**, and every
profile field is optional. An unreleased character has no `Character_Base` row,
so it has no types, no rarity and no profile; two of the ten (CH0033, CH0043)
already have a shipped skin and a portrait, and the rest have neither. They are
hidden by default and badged when shown, so a name the game does not display
yet is never presented as a released one.

### Filter state survives navigation

`lib/filterStore.ts` (Zustand) holds both list pages' filters and the gallery's
selection. Next.js unmounts a page component on every route change, so
component state cannot survive a trip to a character page and back; the store
can. It is **in-memory only** — a "where was I" convenience for one session,
not a saved preference.

**Labels are English, values keep Korean too.** Each type row carries `en`
beside the Korean `name`, and the UI leads with `en`. Only the element rows
have finished English in the game's own text table — every other row's `eng`
column holds the Japanese string — so `en` comes from a fixed table in the
generator, romanised the way the game's own `nameKey` and `Logo_*` sprite names
do it. The generator prints a warning if a type row appears that the table has
no label for.

**A skin is identified by its character, not its rig.** A gallery row and the
viewer heading both read `루시아 (Standing)`; the asset key stays on the second
line, because it is what the pipeline calls the rig rather than what the rig
is. The skin gallery deliberately carries **no unit facts** — element, role,
rarity and the rest belong to the character, and the row links to the character
page that owns them. The filter box matches the name alongside the asset key
and code.

All of it is **decoration, never a dependency**: the fetch is separate from the
skin list and a failure leaves the gallery fully usable. Every field is
optional.

The type filters are one object keyed by table. A deselect must **delete** the
key rather than set it to `undefined`: the page filters by walking
`Object.entries`, so a present-but-undefined entry compares against every
character's real type value, matches none, and empties the list.

### In-game icon art

`public/icons/{ui,char,cutin,skin}/<Name>.webp` is published by the local icon
pipeline, and `data/icons.json` lists what exists. `lib/icons.ts` resolves a
name against that manifest and `components/gameIcon.tsx` renders the result;
**a name with no published file renders nothing** — the app never emits an
`<img>` that will 404.

Resolution is a *candidate list*, not a single name, because the master data
names icons the client cannot always produce: `Role_Icon_Data.icon` is
`Icon_Role_Tanker`, which no atlas bundle carries, while its `item_icon`
(`Icon_Item_Role_Tanker`) exists. The type tables therefore emit `icons` in
preference order.

The same rule covers skins: a rig uses its own `Thumbnail_*` when the game
ships one and falls back to the character portrait, because a standing rig has
no separate thumbnail — the portrait *is* its art. Four rigs
(`pl_cutin_0001/0002`, `pl_title_0001`, `st_sc0101`) have no icon at all.

A portrait name is **not derived from the character code**. It is
`Character_Resources.icon_path`, which is `Icon_Boss_Manageress` for NP0199 and
`Icon_NPC_Maid_Novice_202` for NP0104. Always resolve through `iconPath`.

**Element icons must be tinted.** All four ship as the same flat white
silhouette and the game paints each one with the colour in its own
`Attribute_Icon_Data` row; untinted, they are indistinguishable. `GameIcon`
applies the colour as a CSS mask so the sprite's alpha survives. Role,
position, division and faction art is white by design and carries no colour.
`Icon_Attribute_All` is the multi-coloured "All Attributes" catch-all — a UI
element, not a game element. No character has attribute 0, so it is excluded
from the filter row.

**A missing icon still occupies its box.** `GameIcon` renders an empty box of
the requested size when nothing resolves, so a label row keeps its alignment
whether or not the art exists. Pass `reserve={false}` where the icon is alone
in its slot and an empty square would be visible noise.

**An absent code means "do not name this", not "lookup failed."** Codes with no
entry are either not characters (event, screen and cut-in assets) or unreleased
characters, and both correctly fall back to the skin key.

Only Korean columns are finished content, so character names, descriptions and
credits come from them; the `unfinished` locale columns must not be displayed.
The English *type* labels are a separate, generated table — see above — not a
locale column.

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

Spine `bg_on`/`bg_off` events with a named or indexed drawer-background payload
switch that exact layer (including paired multi-layer backgrounds). Untargeted
events address the white overlay: `bg_on` opens opaque white and `bg_off` clears
it. The background toggle remains independent. `bg_change` is not yet reproduced.

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
- Chrome icons are inline SVG paths in `chrome.tsx`. The viewer's own controls
  (play, camera, layers, save) stay SVG: the game has no UI art for them. Game
  icon art is used for what the game itself labels — elements, roles, factions,
  rarity, rig families, characters and skins — through `components/gameIcon.tsx`.
- The viewer holds PixiJS/Spine objects in refs, never in state, and both
  libraries are dynamically imported inside the build effect so they stay out of
  the initial bundle.
