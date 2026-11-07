import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { LineText } from '@/components/storyLines';
import { storyAssetUrl } from '@/lib/data';
import type { FxIndex } from './fx';

const CANVAS_W = 2340;
const CANVAS_H = 1080;
// The prefab's own Bar_NameColor tint, kept when the speaker authors no personal colour (inferred gating on `UseCharacterColor`).
const DEFAULT_BAR = 'rgb(255, 209, 0)';
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const LETTER = '-0.03em';

export type GameLine = { author: string; actor: string | null; text: string; printer: string; waiting: boolean };

const ui = (name: string) => `url(${storyAssetUrl('ui', name)})`;

type Art = FxIndex['ui'];

// One axis of a sliced sprite as [source start, source end, dest start, dest end] per slice; borders shrink to fit, and an empty centre stretches its edge pixel, as Unity's does.
function axis(size: number, a: number, b: number, length: number): number[][] {
  const fit = Math.min(1, length / Math.max(1, a + b));
  const edge = Math.min(a, size - 1);
  const [c0, c1] = size - b > a ? [a, size - b] : [edge, edge + 1];
  return [[0, a, 0, a * fit], [c0, c1, a * fit, length - b * fit], [size - b, size, length - b * fit, length]];
}

const tinted = new Map<string, Promise<string>>();

// Unity's tint: every pixel's colour and alpha multiplied by the tint's, baked once per sprite and colour.
function tintedUrl(name: string, rgba: [number, number, number, number]): Promise<string> {
  const key = `${name}|${rgba.join(',')}`;
  let url = tinted.get(key);
  if (!url) {
    url = new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, image.width, image.height);
        for (let i = 0; i < data.data.length; i += 4) {
          for (let k = 0; k < 4; k += 1) data.data[i + k] = Math.round(data.data[i + k] * rgba[k]);
        }
        context.putImageData(data, 0, 0);
        resolve(canvas.toDataURL());
      };
      image.onerror = reject;
      image.src = storyAssetUrl('ui', name);
    });
    tinted.set(key, url);
  }
  return url;
}

// A sliced, tinted `Image`: nine tiles, each its slice of the tinted sprite.
function Sliced({ name, art, tint, width, height, style }: {
  name: string; art: Art; tint: string; width: number; height: number; style?: CSSProperties;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const [, r, g, b, a = '1'] = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(tint) ?? [];
    if (!r) return undefined;
    let live = true;
    tintedUrl(name, [Number(r) / 255, Number(g) / 255, Number(b) / 255, Number(a)]).then((value) => { if (live) setUrl(value); }).catch(() => {});
    return () => { live = false; };
  }, [name, tint]);
  const entry = art?.[name];
  if (!entry) return null;
  const [w, h] = entry.size;
  const [top, right, bottom, left] = entry.border;
  const cols = axis(w, left, right, width);
  const rows = axis(h, top, bottom, height);
  return (
    <div style={{ position: 'absolute', width, height, ...style }}>
      {rows.flatMap(([sy0, sy1, dy0, dy1], row) => cols.map(([sx0, sx1, dx0, dx1], c) => {
        const dw = dx1 - dx0;
        const dh = dy1 - dy0;
        const sw = Math.max(1e-3, sx1 - sx0);
        const sh = Math.max(1e-3, sy1 - sy0);
        if (dw <= 0 || dh <= 0) return null;
        const size = `${(w * dw) / sw}px ${(h * dh) / sh}px`;
        const position = `${(-sx0 * dw) / sw}px ${(-sy0 * dh) / sh}px`;
        return (
          <div key={`${row}${c}`} style={{
            position: 'absolute', left: dx0, top: dy0, width: dw, height: dh,
            backgroundImage: url ? `url(${url})` : undefined, backgroundRepeat: 'no-repeat', backgroundSize: size, backgroundPosition: position,
          }} />
        );
      }))}
    </div>
  );
}

function Indicator({ show }: { show: boolean }) {
  // InputIndicatorWhite: `Continue`, alpha ping-pong 0 <-> 1 over 1.5 s once the line is revealed.
  if (!show) return null;
  return (
    <span style={{
      display: 'inline-block', width: 32, height: 32, marginLeft: 8, verticalAlign: 'baseline',
      backgroundImage: ui('Continue'), backgroundSize: 'contain', animation: 'storyIndicator 1.5s ease-in-out infinite alternate',
    }} />
  );
}

function Dialogue({ line, fx, printerRef }: { line: GameLine; fx: FxIndex | null; printerRef: Ref<HTMLDivElement> }) {
  const wide = line.printer === 'ExWide';
  const avatar = wide && line.actor ? fx?.avatars?.[line.actor] : undefined;
  const hex = line.actor ? fx?.colors?.[line.actor] : undefined;
  const bar = hex ? `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})` : DEFAULT_BAR;
  const art = fx?.ui;
  // PrinterPanel: 1500 wide, centred at the bottom; ExWide puts a 270-wide portrait column (+2 pad, 5 gap) before the printer.
  const panelLeft = (CANVAS_W - 1500) / 2;
  const printerLeft = wide ? panelLeft + 2 + 270 + 5 - 2 : panelLeft;
  const printerWidth = wide ? 1500 - 2 - 270 - 5 + 2 : 1500;
  const printerBottom = wide ? -30 + 10 : 20;
  return (
    <>
      <Sliced name="Dialogue_Bg_Gradation" art={art} tint="rgba(13, 18, 36, 0.6)" width={4500} height={660}
        style={{ left: panelLeft - 1500, bottom: -300 }} />
      {avatar && (
        <div style={{
          position: 'absolute', left: panelLeft + 2 + 270 + 50 - 1080, width: 1080, bottom: 41 - 40, height: 1080, overflow: 'hidden',
          // the soft mask is the sprite's horizontal fade: opaque, then its right 127 px fading out
          WebkitMaskImage: `linear-gradient(#000, #000), ${ui('LobbyOption_Bg_gradation128')}`,
          WebkitMaskSize: '952px 100%, 128px 100%', WebkitMaskPosition: 'left top, right top', WebkitMaskRepeat: 'no-repeat',
        }}>
          <div style={{
            position: 'absolute', left: 1080 - 250 - 190, bottom: 300 - 190, width: 380, height: 380,
            backgroundImage: `url(${PUBLIC_BASE}/icons/${avatar}.webp)`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
          }} />
        </div>
      )}
      <div ref={printerRef} style={{ position: 'absolute', left: printerLeft, width: printerWidth, bottom: printerBottom, height: 341 }}>
        <div style={{ height: 94, display: 'flex', alignItems: 'flex-end', padding: '10px 25px 10px 63px' }}>
          {line.author && (
            <div style={{ position: 'relative', fontSize: 70, lineHeight: '74px', color: '#fff', letterSpacing: LETTER, whiteSpace: 'nowrap' }}>
              <Sliced name="Dialoge_Circle10_Glow" art={art} tint={bar} width={24} height={64} style={{ left: -22 - 12, top: '50%', marginTop: -32 }} />
              {line.author}
            </div>
          )}
        </div>
        <div style={{ width: 1780, height: 2, background: 'rgba(255, 255, 255, 0.2)' }} />
        <div style={{ height: 245, padding: '10px 25px 25px', fontSize: 48, color: '#fff', letterSpacing: LETTER, whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>
          <LineText text={line.text} />
          <Indicator show={line.waiting} />
        </div>
      </div>
    </>
  );
}

function Centered({ line, printerRef }: { line: GameLine; printerRef: Ref<HTMLDivElement> }) {
  const full = line.printer === 'ExFullScreen';
  // ExCenterSubtitle: 52 px centred across the screen; ExFullScreen: 44 px left-aligned in a 900-wide column over a veil.
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: full ? 'rgba(31, 31, 51, 0.55)' : undefined }}>
      <div ref={printerRef} style={{
        width: full ? 900 : CANVAS_W - 20, fontSize: full ? 44 : 52, color: '#fff', textAlign: full ? 'left' : 'center',
        letterSpacing: full ? undefined : LETTER, whiteSpace: 'pre-wrap', lineHeight: 1.35,
      }}>
        <LineText text={line.text} />
      </div>
    </div>
  );
}

// UIMarqueTextNode: an 800-wide window; text wider than it scrolls at 30 px/s after a 1 s hold, holds 1 s at the end, and starts over.
function Marquee({ text }: { text: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => { setOverflow(Math.max(0, (textRef.current?.scrollWidth ?? 0) - 780)); }, [text]);
  const travel = overflow / 30;
  const cycle = travel + 2;
  const name = `storyMarquee${Math.round(overflow)}`;
  return (
    <span style={{ position: 'relative', width: 800, height: 80, marginLeft: -15, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
      {overflow > 0 && (
        <style>{`@keyframes ${name} { 0%, ${(100 / cycle).toFixed(2)}% { transform: translateX(0) } ${(100 * (1 + travel) / cycle).toFixed(2)}%, 100% { transform: translateX(-${overflow}px) } }`}</style>
      )}
      <span ref={textRef} style={{
        paddingLeft: 20, fontSize: 52, color: '#fff', whiteSpace: 'nowrap',
        animation: overflow > 0 ? `${name} ${cycle}s linear infinite` : undefined,
      }}>{text}</span>
    </span>
  );
}

function Choices({ options, pick, fx }: { options: string[]; pick: (i: number) => void; fx: FxIndex | null }) {
  // ExButtonList: a vertical stack, 30 apart, right-anchored 80 from the edge and 13 above the middle; ExChoiceButton 930 x 94.
  return (
    <div style={{ position: 'absolute', right: 80, top: '50%', transform: 'translateY(calc(-50% - 13px))', display: 'flex', flexDirection: 'column', gap: 30 }}>
      {options.map((option, i) => (
        <button key={i} type="button" onClick={(e) => { e.stopPropagation(); pick(i); }} style={{
          position: 'relative', width: 930, height: 94, border: 0, padding: '0 25px 0 20px', display: 'flex', alignItems: 'center',
          cursor: 'pointer', background: 'transparent',
        }}>
          <Sliced name="M5_Desire_CircleBg82" art={fx?.ui} tint="rgb(8, 222, 217)" width={930} height={94} style={{ left: 0, top: 0 }} />
          <span style={{ position: 'relative', width: 60, height: 60, flex: 'none', backgroundImage: ui('talk_tabicon_chat'), backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
          <Marquee text={option} />
        </button>
      ))}
    </div>
  );
}

// The `Dialogue_Place` clip (2.833 s), as keyframe percentages: the box opens, the text bounces in, holds, and it all retracts.
const PLACE_KEYFRAMES = `
@keyframes storyPlaceBox { 0%, 5.9% { width: 0 } 17.6%, 88.2% { width: 500px } 94.1%, 100% { width: 0 } }
@keyframes storyPlaceBar { 0% { height: 0 } 5.9%, 94.1% { height: 120px } 100% { height: 0 } }
@keyframes storyPlaceTitle { 0%, 17.6% { opacity: 0 } 23.5%, 82.4% { opacity: 1 } 88.2%, 100% { opacity: 0 } }
@keyframes storyPlaceTitleY { 0% { transform: translateY(-50%) } 20.6% { transform: translateY(calc(-50% + 10px)) } 26.5%, 79.4% { transform: translateY(-50%) } 85.3% { transform: translateY(calc(-50% + 10px)) } 100% { transform: translateY(-50%) } }
@keyframes storyPlaceTag { 0%, 17.6% { opacity: 0; transform: translateY(0) } 19.4% { transform: translateY(7px) } 23.5% { opacity: 1 } 26.5% { transform: translateY(0) } 79.4% { transform: translateY(0) } 82.4% { opacity: 1 } 86.5% { transform: translateY(7px) } 88.2%, 100% { opacity: 0; transform: translateY(0) } }
`;

function Place({ text, fx }: { text: string; fx: FxIndex | null }) {
  // EcPlace Info: 500 x 120 at (140, 200) from the top left, black 0.6 fading right, a cyan bar, a faint slash pattern, the title and a PLACE rule.
  const clip = (name: string) => `${name} 2.833s linear forwards`;
  return (
    <div style={{ position: 'absolute', left: 140, top: 200, height: 120 }}>
      <style>{PLACE_KEYFRAMES}</style>
      <div style={{ position: 'absolute', left: 0, top: 0, height: 120, overflow: 'hidden', animation: clip('storyPlaceBox') }}>
        <Sliced name="Bg_gradation128" art={fx?.ui} tint="rgba(0, 0, 0, 0.6)" width={500} height={120} style={{ left: 0, top: 0 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: 500, height: 120, backgroundImage: ui('M4_Inven_SlashLine'), backgroundSize: '32px 32px', opacity: 0.05 }} />
        {/* the rule retracts with the box */}
        <div style={{ position: 'absolute', left: 40, width: 400, bottom: 24, height: 2, background: 'rgba(0, 245, 255, 0.2)' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 500, height: 120 }}>
        <div style={{ position: 'absolute', left: 40, top: 60 - 15, fontSize: 40, color: '#fff', whiteSpace: 'nowrap', animation: `${clip('storyPlaceTitle')}, ${clip('storyPlaceTitleY')}` }}>{text}</div>
        <div style={{ position: 'absolute', left: 40, bottom: 24 + 8, fontSize: 15, color: 'rgba(255, 255, 255, 0.2)', animation: clip('storyPlaceTag') }}>PLACE</div>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 10, background: 'rgb(0, 245, 255)', animation: clip('storyPlaceBar') }} />
    </div>
  );
}

// A battle bark: the speaker's cut-in and line on the side the bark names; this layout is the site's, the battle UI prefab is not decoded.
function Bark({ bark, fx }: { bark: GameBark; fx: FxIndex | null }) {
  const right = bark.side === 'right';
  return (
    <div style={{ position: 'absolute', bottom: 120, [right ? 'right' : 'left']: 0, width: 1100, height: 220 }}>
      <Sliced name="Bg_gradation128" art={fx?.ui} tint="rgba(0, 0, 0, 0.6)" width={1100} height={220}
        style={{ left: 0, top: 0, transform: right ? 'scaleX(-1)' : undefined }} />
      {bark.icon && (
        <div style={{
          position: 'absolute', bottom: 0, [right ? 'right' : 'left']: 20, width: 340, height: 560,
          backgroundImage: `url(${PUBLIC_BASE}/icons/cutin/${bark.icon}.webp)`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom',
        }} />
      )}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, [right ? 'right' : 'left']: 360, width: 700, display: 'flex', alignItems: 'center',
        justifyContent: right ? 'flex-end' : 'flex-start', textAlign: right ? 'right' : 'left', fontSize: 46, color: '#fff', letterSpacing: LETTER,
        whiteSpace: 'pre-wrap',
      }}>
        <LineText text={bark.text} />
      </div>
    </div>
  );
}

export type GameBark = { icon: string | null; side: 'left' | 'right'; text: string };

// The game's printers, choice list and place caption on their 2340 x 1080 canvas, scaled to the player.
export function GameUi({ line, choices, place, fx, printerRef, bark }: {
  bark: GameBark | null;
  line: GameLine | null;
  choices: { options: string[]; pick: (i: number) => void } | null;
  place: string | null;
  fx: FxIndex | null;
  printerRef: Ref<HTMLDivElement>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const fit = () => setScale(host.clientWidth / CANVAS_W);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const centered = line?.printer === 'ExCenterSubtitle' || line?.printer === 'ExFullScreen';
  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: choices ? 'auto' : 'none' }}>
      <style>{'@keyframes storyIndicator { from { opacity: 0 } to { opacity: 1 } }'}</style>
      <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        {place && <Place key={place} text={place} fx={fx} />}
        {line && (centered ? <Centered line={line} printerRef={printerRef} /> : <Dialogue line={line} fx={fx} printerRef={printerRef} />)}
        {choices && <Choices options={choices.options} pick={choices.pick} fx={fx} />}
        {bark && <Bark bark={bark} fx={fx} />}
      </div>
    </div>
  );
}
