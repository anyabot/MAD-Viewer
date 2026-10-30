import { characterName, equipmentSlotsOf, infusionNodes, infusionReach, INFUSION_PATHS } from '@/lib/characters';
import { planStar, type UnitPlan } from '@/lib/farm';
import { resolveIcon, type IconManifest } from '@/lib/icons';
import { dataText, type Lang } from '@/lib/i18n';
import type { CharacterData } from '@/lib/data';

export type ImageUnit = { code: string | null; plan?: UnitPlan; friend?: boolean };
export type ImageRow = { label?: string; icon?: string | null; units: ImageUnit[] };
export type ImageSpec = {
  title: string; subtitle?: string; rows: ImageRow[];
  chars: CharacterData; icons: IconManifest | null; lang: Lang; friendLabel: string;
};

const TILE_W = 132;
const TILE_H = 232;
const GAP = 10;
const PAD = 20;
const LABEL_W = 200;
const PORTRAIT = 112;
const SCALE = 2;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let out = text;
  while (out.length > 1 && g.measureText(`${out}…`).width > width) out = out.slice(0, -1);
  return `${out}…`;
}

// Two lines at most, word-wrapped, the second ellipsised.
function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/);
  let first = '';
  let i = 0;
  for (; i < words.length; i += 1) {
    const next = first ? `${first} ${words[i]}` : words[i];
    if (g.measureText(next).width > width && first) break;
    first = next;
  }
  const rest = words.slice(i).join(' ');
  return rest ? [fit(g, first, width), fit(g, rest, width)] : [fit(g, first, width)];
}

// The element marks ship as white silhouettes the game tints.
function tint(img: HTMLImageElement, color: string, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, size, size);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  return c;
}

export async function partyImage(spec: ImageSpec): Promise<Blob | null> {
  const { title, subtitle, rows, chars, icons, lang, friendLabel } = spec;
  const labelled = rows.some((r) => r.label);
  const head = subtitle ? 64 : 44;
  const width = PAD * 2 + (labelled ? LABEL_W : 0) + 5 * TILE_W + 4 * GAP;
  const height = PAD * 2 + head + rows.length * TILE_H + (rows.length - 1) * GAP;
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.scale(SCALE, SCALE);
  g.imageSmoothingQuality = 'high';
  const font = (size: number, weight = 'normal') => `${weight} ${size}px Inter, system-ui, sans-serif`;

  const art = new Map<string, HTMLImageElement | null>();
  const want = (src: string | null | undefined) => {
    if (src && !art.has(src)) art.set(src, null);
    return src ?? null;
  };
  const get = (src: string | null) => (src ? art.get(src) ?? null : null);
  const charSrc = (code: string) => resolveIcon(icons, 'char', [chars.characters[code]?.iconPath, `Icon_${code}`]);
  const gearSrc = (slot: { icon?: string | null; tiers?: { tier: number; icon?: string | null }[] }, tier: number) =>
    resolveIcon(icons, 'equip', [tier > 0 ? slot.tiers?.find((r) => r.tier === tier)?.icon : null, slot.icon]);
  const attrOf = (code: string) => {
    const v = chars.characters[code]?.attributeType;
    return v != null ? chars.types.attribute[String(v)] ?? null : null;
  };

  for (const row of rows) {
    want(row.icon);
    for (const u of row.units) {
      if (!u.code) continue;
      want(charSrc(u.code));
      want(resolveIcon(icons, 'ui', [attrOf(u.code)?.icon]));
      const entry = chars.characters[u.code];
      if (entry && u.plan) {
        for (const slot of equipmentSlotsOf(entry, chars.equipment)) {
          want(gearSrc(slot, u.plan.gear[String(slot.type)]?.tier ?? 0));
        }
      }
    }
  }
  await Promise.all([...art.keys()].map(async (src) => art.set(src, await loadImage(src))));

  g.fillStyle = '#171923';
  g.fillRect(0, 0, width, height);
  g.textBaseline = 'top';
  g.fillStyle = '#f7fafc';
  g.font = font(22, 'bold');
  g.fillText(fit(g, title, width - PAD * 2), PAD, PAD);
  if (subtitle) {
    g.fillStyle = '#a0aec0';
    g.font = font(14);
    g.fillText(fit(g, subtitle, width - PAD * 2), PAD, PAD + 30);
  }

  rows.forEach((row, r) => {
    const top = PAD + head + r * (TILE_H + GAP);
    let x = PAD;
    if (labelled) {
      const icon = get(row.icon ?? null);
      if (icon) g.drawImage(icon, x, top + TILE_H / 2 - 44, 40, 40);
      g.fillStyle = '#e2e8f0';
      g.font = font(15, 'bold');
      g.textBaseline = 'top';
      wrap(g, row.label ?? '', LABEL_W - 16).forEach((line, k) => g.fillText(line, x, top + TILE_H / 2 + 2 + k * 20));
      x += LABEL_W;
    }
    row.units.forEach((u, i) => {
      const left = x + i * (TILE_W + GAP);
      const mid = left + TILE_W / 2;
      g.fillStyle = '#1f2433';
      g.fillRect(left, top, TILE_W, TILE_H);
      g.strokeStyle = u.friend ? '#4fd1c5' : '#3a4152';
      g.lineWidth = 2;
      g.setLineDash(u.friend && !u.code ? [6, 4] : []);
      g.strokeRect(left + 1, top + 1, TILE_W - 2, TILE_H - 2);
      g.setLineDash([]);
      g.textAlign = 'center';
      g.textBaseline = 'top';
      const entry = u.code ? chars.characters[u.code] : undefined;
      if (u.friend && !u.code) {
        g.fillStyle = '#4fd1c5';
        g.font = font(13, 'bold');
        g.fillText(friendLabel, mid, top + TILE_H / 2 - 8);
        g.textAlign = 'left';
        return;
      }
      const portrait = u.code ? get(charSrc(u.code)) : null;
      const py = top + 10;
      if (portrait) g.drawImage(portrait, mid - PORTRAIT / 2, py, PORTRAIT, PORTRAIT);
      const attr = u.code ? attrOf(u.code) : null;
      const mark = get(resolveIcon(icons, 'ui', [attr?.icon]));
      if (mark) {
        const disc = 28;
        const size = 20;
        const cx = mid - PORTRAIT / 2 + disc / 2;
        const cy = py + PORTRAIT - disc / 2;
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.beginPath();
        g.arc(cx, cy, disc / 2, 0, Math.PI * 2);
        g.fill();
        g.drawImage(attr?.color ? tint(mark, attr.color, size * SCALE) : mark,
          cx - size / 2, cy - size / 2, size, size);
      }
      let y = py + PORTRAIT + 6;
      if (entry) {
        g.fillStyle = '#f7fafc';
        g.font = font(14, 'bold');
        g.fillText(fit(g, characterName(entry, lang), TILE_W - 10), mid, y);
        y += 20;
      }
      if (u.friend) {
        g.fillStyle = '#4fd1c5';
        g.font = font(12, 'bold');
        g.fillText(friendLabel, mid, y);
      }
      if (entry && u.plan) {
        const plan = u.plan;
        const star = planStar(plan, entry);
        g.fillStyle = '#a0aec0';
        g.font = font(12);
        g.fillText(`Lv${plan.level} · ${star}★`, mid, y);
        y += 20;
        const slots = equipmentSlotsOf(entry, chars.equipment);
        slots.forEach((slot, k) => {
          const gear = plan.gear[String(slot.type)];
          const on = (gear?.tier ?? 0) > 0;
          const gx = mid - (slots.length * 34) / 2 + k * 34;
          g.globalAlpha = on ? 1 : 0.3;
          const icon = get(gearSrc(slot, gear?.tier ?? 0));
          if (icon) g.drawImage(icon, gx + 5, y, 24, 24);
          g.fillStyle = '#cbd5e0';
          g.font = font(10);
          g.fillText(on ? String(gear!.level) : '–', gx + 17, y + 25);
          g.globalAlpha = 1;
        });
        y += 40;
        const paths = INFUSION_PATHS.filter((path) => infusionNodes(entry, path).length > 0);
        const step = 40;
        paths.forEach((path, k) => {
          const n = Math.min(plan.infusion?.[path] ?? 0, infusionReach(entry, path, star));
          const name = chars.infusion?.paths[path];
          g.fillStyle = n ? '#d6bcfa' : 'rgba(255,255,255,0.35)';
          g.font = font(11);
          g.fillText(`${(dataText(lang, name?.name, name?.nameEn) || path).charAt(0)}${n}`,
            mid - ((paths.length - 1) * step) / 2 + k * step, y);
        });
      }
      g.textAlign = 'left';
    });
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
