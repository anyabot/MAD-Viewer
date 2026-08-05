// An `[@emo <name>]` names a particle prefab, not a sprite in the skin archive,
// so the emitters and their sheets are published separately. Placement comes
// with them: the prefab names a slot and each rig authors that slot's bone and
// offset, so an emote anchors to the rig's own head.
import {
  loadEmoticons, type EmoteEmitter, type EmoticonManifest, type EmoticonSlot,
} from '@/lib/data';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export type EmotePlacement = {
  /** Skeleton bone the slot hangs off, as the rig spells it. */
  bone: string;
  offset: [number, number];
  /** A prefab is authored for one facing, so a right-facing rig mirrors it. */
  mirror: boolean;
  /** In hierarchy order. */
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

/** Null rather than a default position when the character has no authored
 *  slots: an emote parked at an invented point is worse than no emote. */
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
