// The lobby emotes — the "?" and "!" that pop over a character when a lobby
// line plays.
//
// A line stages itself with `[@emo <name>]`. In game each name is a Unity
// particle prefab (`FX_Char_Emo_03_Question`), so there is no sprite to take
// from the skin archive; the local pipeline publishes each prefab's emitters to
// `emoticons.json` and their texture sheets to `public/emoticons/fx/`.
//
// Placement comes with it. The prefab names one of three slots and every
// standing rig authors that slot's bone and x/y offset individually, so an
// emote is anchored to the rig's own head rather than to a guessed point above
// its bounds.
import {
  loadEmoticons, type EmoteEmitter, type EmoticonManifest, type EmoticonSlot,
} from '@/lib/data';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export type EmotePlacement = {
  /** Skeleton bone the slot hangs off, as the rig spells it. */
  bone: string;
  offset: [number, number];
  /**
   * Whether the whole effect is mirrored in x. A prefab is authored for one
   * facing — most of them place their emitters left of the slot — and the game
   * mirrors it for a right-facing rig.
   */
  mirror: boolean;
  /** The prefab's emitters, in hierarchy order. */
  emitters: EmoteEmitter[];
  /** Sheet name -> `{url, tile grid source size}`. */
  sheets: Record<string, { url: string; width: number; height: number }>;
};

export function emoticonUrl(name: string): string {
  return `${PUBLIC_BASE}/emoticons/${name}.webp`;
}

export function emoteSheetUrl(name: string): string {
  return `${PUBLIC_BASE}/emoticons/fx/${name}.webp`;
}

// A name the corpus uses but the pipeline never published must render as
// nothing, the way a missing icon does.
export function hasEmoticon(
  manifest: EmoticonManifest | null, name: string | null | undefined,
): boolean {
  return !!name && !!manifest?.emotes[name];
}

/**
 * Where and what this character shows for this emote, or null when either half
 * is missing.
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
  const emitters = emote.emitters ?? [];
  if (!emitters.length) return null;
  const sheets: EmotePlacement['sheets'] = {};
  for (const emitter of emitters) {
    const size = manifest?.sheets[emitter.sheet];
    if (!size) continue;
    sheets[emitter.sheet] = {
      url: emoteSheetUrl(emitter.sheet), width: size[0], height: size[1],
    };
  }
  return { bone, offset, mirror: actor.look === 'Right', emitters, sheets };
}

export { loadEmoticons };
export type { EmoticonManifest, EmoticonSlot, EmoteEmitter };
