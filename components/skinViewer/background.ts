// The room sprites behind the rig: which one is showing, and where it is drawn.
//
// A drawer background is not drawn at its sprite size on the rig origin: it
// hangs on a `bg*` skeleton bone and is drawn at that bone's world position and
// rotation, sized `sprite size * bone scale`. The bone is the only place the
// room's real size lives, so a rig whose bone is not identity is framed wrongly
// without it.
//
// That bone is also the layer's identity: a room is addressed by the name of the
// bone it stands on, which is what a `bg_on` / `bg_off` event's integer payload
// resolves to. Every room that stands on a bone of its own is drawn from the
// start; a sprite that stands on no bone of its own is a swap variant, which
// only `bg_change` brings in.
import { backgroundBoneName } from '@/components/skinViewer/types';
import { loadTexture } from '@/lib/skinArchive';

export type BackgroundStage = {
  sprites: any[];
  /** Re-apply the visible/hidden state; call after the show-background toggle. */
  applyVisibility: () => void;
  /** Drive position, rotation and size off the anchor bones. Runs per frame. */
  applyTransforms: () => void;
  /** Return to the rooms the rig opens on, discarding every authored switch. */
  reset: () => void;
  /**
   * Show or hide the room standing on the bone a `bg_on` / `bg_off` event's
   * integer payload names. An index naming no room this rig has changes
   * nothing — the client builds an empty renderer there, which draws nothing.
   */
  switchBackground: (eventName: string, targetIndex: number) => void;
  /**
   * Handle `bg_change`: cross-fade the layer on the bone the integer payload
   * names onto the sprite whose own name is `spriteName`. The viewer swaps
   * instantly; the client's fade duration is not modelled.
   */
  changeBackground: (targetIndex: number, spriteName: string) => void;
};

/**
 * Build every background sprite the rig declares and return the handles the
 * viewer drives them with. Textures are loaded in order; `isDestroyed` is
 * polled between them so a teardown mid-load stops the build.
 */
export async function buildBackgrounds(options: {
  PIXI: any;
  archive: string;
  files: Map<string, Blob>;
  scene: any;
  spine: any;
  world: any;
  showBg: () => boolean;
  isDestroyed: () => boolean;
}): Promise<BackgroundStage | null> {
  const { PIXI, archive, files, scene, spine, world, showBg, isDestroyed } = options;

  const defs = world.backgrounds?.length
    ? world.backgrounds
    : world.bg ? [{ ...world.bg, name: world.bg.name ?? world.bg.tex.replace(/\.png$/i, '') }] : [];

  // The pairing is by name, ignoring case: the sprite name ends with the bone
  // name. The longest match wins, so `bg_2` is not claimed by `bg`.
  //
  // A background the rig only swaps in — `*_bg_off` against `*_bg` — names no
  // bone of its own, because the client does not build it a renderer: it
  // cross-fades it onto the renderer already standing on that bone. So an
  // unmatched entry inherits the last matched one for its transform. One that
  // follows no match at all keeps its authored size and origin.
  const boneNameOf = (def: any): string =>
    String(def.name ?? def.tex ?? '').replace(/\.png$/i, '').toLowerCase();
  let inherited: any = null;
  const ownBones = defs.map((def: any) => {
    const wanted = boneNameOf(def);
    let best: any = null;
    for (const bone of spine.skeleton.bones) {
      const name = bone.data.name.toLowerCase();
      if (!name.startsWith('bg') || !wanted.endsWith(name)) continue;
      if (!best || name.length > best.data.name.length) best = bone;
    }
    return best;
  });
  const anchors = ownBones.map((bone: any) => {
    if (bone) inherited = bone;
    return bone ?? inherited;
  });

  // One renderer per bone, holding every sprite that can stand on it: the one it
  // was built with plus the variants `bg_change` cross-fades in. A def with a
  // bone of its own opens a layer; one without joins the layer before it.
  type Layer = { bone: string | null; defs: number[]; shown: number; on: boolean };
  const layers: Layer[] = [];
  defs.forEach((_def: any, index: number) => {
    const bone = ownBones[index];
    if (bone || !layers.length) {
      layers.push({
        bone: bone ? bone.data.name.toLowerCase() : null,
        defs: [index],
        shown: index,
        on: true,
      });
    } else {
      layers[layers.length - 1].defs.push(index);
    }
  });
  // Every layer opens visible on the sprite it was built with — the renderer's
  // constructor sets its colour to opaque white.
  const layerOf = (index: number) => layers.find((l) => l.defs.includes(index))!;

  const sprites: any[] = [];
  const applyVisibility = () => {
    sprites.forEach((sprite, index) => {
      const layer = layerOf(index);
      sprite.visible = showBg() && layer.on && layer.shown === index;
    });
  };
  const reset = () => {
    for (const layer of layers) {
      layer.on = true;
      [layer.shown] = layer.defs;
    }
    applyVisibility();
  };

  for (let index = 0; index < defs.length; index++) {
    const def = defs[index];
    const texture = await loadTexture(PIXI, archive, files, def.tex);
    if (isDestroyed()) return null;
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    // Pixi's y axis points down; Unity's points up.
    sprite.position.set(def.x, -def.y);
    sprite.width = def.w;
    sprite.height = def.h;
    sprite.zIndex = -20 + index;
    scene.addChild(sprite);
    sprites.push(sprite);
  }

  const layerAt = (targetIndex: number) => {
    const wanted = backgroundBoneName(targetIndex);
    return layers.find((l) => l.bone === wanted) ?? null;
  };

  const switchBackground = (eventName: string, targetIndex: number) => {
    const layer = layerAt(targetIndex);
    if (!layer) return;
    layer.on = eventName === 'bg_on';
    applyVisibility();
  };

  const changeBackground = (targetIndex: number, spriteName: string) => {
    const layer = layerAt(targetIndex);
    if (!layer || !spriteName) return;
    // The client matches the sprite's own name exactly, and logs an error when
    // the rig carries no such sprite rather than falling back to anything.
    const next = layer.defs.find((i) => defs[i].name === spriteName);
    if (next === undefined) return;
    layer.shown = next;
    applyVisibility();
  };

  // Read every frame: several rigs key their background bones.
  const applyTransforms = () => {
    for (let index = 0; index < sprites.length; index++) {
      const bone = anchors[index];
      const sprite = sprites[index];
      if (!bone || !sprite) continue;
      const def = defs[index];
      // Bone coordinates are skeleton units and `bone.worldY` is already y-down
      // (spine-pixi sets `Skeleton.yDown`), as the emote anchor and the rig
      // camera also rely on.
      const anchor = scene.toLocal(spine.toGlobal({ x: bone.worldX, y: bone.worldY }));
      sprite.position.set(anchor.x, anchor.y);
      // The bone's own scale, not its world scale: the game reads the local
      // pair, the same field the `cam` bone supplies the framing width from.
      sprite.width = def.w * Math.abs(bone.scaleX) * Math.abs(spine.scale.x);
      sprite.height = def.h * Math.abs(bone.scaleY) * Math.abs(spine.scale.y);
      sprite.rotation = bone.getWorldRotationX() * Math.PI / 180;
    }
  };

  applyVisibility();
  return {
    sprites, applyVisibility, applyTransforms, reset, switchBackground, changeBackground,
  };
}
