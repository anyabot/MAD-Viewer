// A room hangs on a `bg*` skeleton bone, drawn at that bone's world position
// and rotation and sized `sprite size * bone scale`. The bone is the only place
// the room's real size lives, and it is also the layer's identity — what a
// `bg_on` / `bg_off` payload resolves to. A sprite standing on no bone of its
// own is a swap variant that only `bg_change` brings in.
import { backgroundBoneName } from '@/components/skinViewer/types';
import { loadTexture } from '@/lib/skinArchive';

export type BackgroundStage = {
  sprites: any[];
  applyVisibility: () => void;
  /** Runs per frame. */
  applyTransforms: () => void;
  /** Return to the rooms the rig opens on, discarding every authored switch. */
  reset: () => void;
  /** An index naming no room this rig has changes nothing: the client builds
   *  an empty renderer there, which draws nothing. */
  switchBackground: (eventName: string, targetIndex: number) => void;
  /** The viewer swaps instantly; the client's fade duration is not modelled. */
  changeBackground: (targetIndex: number, spriteName: string) => void;
};

/** `isDestroyed` is polled between texture loads so a teardown mid-load stops
 *  the build. */
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

  // Paired by name, ignoring case: the sprite name ends with the bone name and
  // the longest match wins, so `bg_2` is not claimed by `bg`. A swap-in variant
  // names no bone of its own, so it inherits the last matched entry's
  // transform, or keeps its authored size and origin when there is none.
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
  // Every layer opens visible on the sprite it was built with.
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
    // Matched on the sprite's own name exactly, with no fallback.
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
      // Skeleton units, and `bone.worldY` is already y-down since spine-pixi
      // sets `Skeleton.yDown`.
      const anchor = scene.toLocal(spine.toGlobal({ x: bone.worldX, y: bone.worldY }));
      sprite.position.set(anchor.x, anchor.y);
      // The bone's local scale, not its world scale, as the game reads it.
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
