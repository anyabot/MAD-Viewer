// The lobby emote bubble. `[@emo]` names a Unity particle prefab, so the
// published art is that prefab's glyph and this is a still, not the effect. The
// sprite lives in `scene` next to the actor so pan, zoom and the device staging
// carry it exactly as they carry the figure.
//
// Placement is the game's own: the prefab picks a slot, and the rig authors that
// slot's bone and offset. Everything is already in skeleton units, so the sprite
// is positioned in the Spine object's local space and converted, exactly as the
// touch-region overlay is.
import { EMOTE_FADE_SECONDS, EMOTE_UNIT_SCALE } from '@/components/skinViewer/constants';
import type { EmotePlacement } from '@/lib/emoticons';

export type EmoteBubble = {
  /** The Pixi sprite, so the caller can hide it while measuring the scene. */
  sprite: any;
  /** Show a glyph for `seconds` of scene time. */
  show: (placement: EmotePlacement, seconds: number) => void;
  hide: () => void;
  /** Fade and re-anchor the glyph. Register on the Pixi ticker. */
  tick: () => void;
};

export function createEmoteBubble(options: {
  PIXI: any;
  scene: any;
  spine: any;
  now: () => number;
  isDestroyed: () => boolean;
}): EmoteBubble {
  const { PIXI, scene, spine, now, isDestroyed } = options;

  const sprite = new PIXI.Sprite();
  sprite.anchor.set(0.5, 0.5);
  sprite.visible = false;
  sprite.eventMode = 'none';
  sprite.zIndex = 30;
  scene.addChild(sprite);

  let token = 0;
  let startedAt = 0;
  let endsAt = 0;
  let place: EmotePlacement | null = null;

  // The rig spells its own bone names (`Face`, `head`, `body_08_head`), so this
  // matches case-insensitively. A rig that has no such bone gets no emote rather
  // than one parked at the origin at its native pixel size.
  const anchorToBone = (): boolean => {
    if (!place) return false;
    const wanted = place.bone.toLowerCase();
    const bone = spine.skeleton.bones.find(
      (b: any) => b.data.name.toLowerCase() === wanted);
    if (!bone) {
      console.warn('emote bone missing', place.bone);
      return false;
    }
    // Bone coordinates and the authored offset are both in skeleton units;
    // `spine.scale` maps those to scene units, which is also what `toGlobal`
    // applies, so the size and the anchor stay consistent.
    //
    // `spine-pixi` sets `Skeleton.yDown = true`, so `bone.worldY` is already
    // y-down. The authored offset is y-up (`+5.75` means above the head), so it
    // is the offset that is subtracted, not the bone.
    const anchor = scene.toLocal(spine.toGlobal({
      x: bone.worldX + place.offset[0],
      y: bone.worldY - place.offset[1],
    }));
    const height = place.height * EMOTE_UNIT_SCALE * Math.abs(spine.scale.y);
    sprite.height = height;
    sprite.width = height * place.aspect;
    sprite.position.set(anchor.x, anchor.y);
    return true;
  };

  return {
    sprite,
    show: (placement, seconds) => {
      const mine = ++token;
      // `loadParser` is named explicitly, as everywhere else here: PIXI picks a
      // parser by extension, and the bare-string form produces no texture.
      void PIXI.Assets.load({ src: placement.url, loadParser: 'loadTextures' })
        .then((texture: any) => {
          if (isDestroyed() || mine !== token) return;
          if (!texture?.source) throw new Error(`no texture for ${placement.url}`);
          sprite.texture = texture;
          sprite.alpha = 0;
          place = placement;
          // Authored seconds on the scene clock: the glyph holds for as long as
          // the line it belongs to, at whatever speed that line runs.
          startedAt = now();
          endsAt = startedAt + seconds;
          sprite.visible = anchorToBone();
        })
        // A decorative asset must not break the reaction it belongs to, and must
        // not fail silently either.
        .catch((err: unknown) => console.warn('emote', placement.url, err));
    },
    hide: () => {
      token += 1;
      sprite.visible = false;
    },
    tick: () => {
      if (!sprite.visible) return;
      if (now() >= endsAt) {
        sprite.visible = false;
        return;
      }
      sprite.alpha = Math.min(
        1,
        (now() - startedAt) / EMOTE_FADE_SECONDS,
        (endsAt - now()) / EMOTE_FADE_SECONDS,
      );
      anchorToBone();
    },
  };
}
