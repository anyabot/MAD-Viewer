// The lobby emote bubbles — the "?" and "!" that pop over a character when a
// lobby line plays.
//
// A line stages itself with `[@emo <name>]`. In game each name is a Unity
// particle prefab (`FX_Char_Emo_03_Question`), so there is no sprite to take
// from the skin archive; the local pipeline publishes each prefab's glyph to
// `public/emoticons/<name>.webp` and lists it in `emoticons.json`.
//
// Placement comes with it. The prefab names one of three slots and every
// standing rig authors that slot's bone and x/y offset individually, so an
// emote is anchored to the rig's own head rather than to a guessed point above
// its bounds.
import { loadEmoticons, type EmoticonManifest, type EmoticonSlot } from '@/lib/data';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export type EmotePlacement = {
  url: string;
  /** Skeleton bone the slot hangs off, as the rig spells it. */
  bone: string;
  offset: [number, number];
  /**
   * Height in the emitter's own particle units. Only the ratio between emotes
   * is authored — the factor converting these to skeleton units is applied by
   * the game's spawn code, so the viewer supplies it.
   */
  height: number;
  aspect: number;
};

export function emoticonUrl(name: string): string {
  return `${PUBLIC_BASE}/emoticons/${name}.webp`;
}

// A name the corpus uses but the pipeline never published must render as
// nothing, the way a missing icon does.
export function hasEmoticon(
  manifest: EmoticonManifest | null, name: string | null | undefined,
): boolean {
  return !!name && !!manifest?.emotes[name];
}

/**
 * Where this character shows this emote, or null when either half is missing.
 *
 * A character with no authored slots (every non-standing rig, and any rig whose
 * bundle the pipeline has not read) yields null rather than a default position:
 * an emote parked at an invented point is worse than no emote.
 */
export function emotePlacement(
  manifest: EmoticonManifest | null,
  name: string | null | undefined,
  character: string | null | undefined,
): EmotePlacement | null {
  const emote = name ? manifest?.emotes[name] : undefined;
  const actor = character ? manifest?.actors[character] : undefined;
  if (!emote || !actor) return null;
  const slot: EmoticonSlot = emote.slot;
  const bone = actor.bones[slot];
  const offset = actor.offsets[slot];
  if (!bone || !offset) return null;
  return {
    url: emoticonUrl(name!),
    bone,
    offset,
    height: emote.height,
    aspect: emote.aspect,
  };
}

export { loadEmoticons };
export type { EmoticonManifest, EmoticonSlot };
