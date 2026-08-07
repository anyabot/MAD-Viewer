// One state per function: it stages clips, an FX style and SFX keys, parks on
// either a clip finishing, a dwell, or a tap, and returns the state to run next.
//
// The FX styles and SFX keys are reported rather than played — neither the
// particle systems nor the audio are exported.
//
// The client advances a phase by *holding*, and falls back to `touch_cancel_0N`
// when the hold breaks early. The viewer advances on a **tap** instead, so the
// three cancel clips have no trigger here and the `Cancel` state is not reached.
import type { Localized } from '@/lib/i18n';

export type GachaState =
  | 'intro' | 'idle' | 'phase1' | 'phase2' | 'phase3' | 'end' | 'done';

/** Grades 1 and 2 stay on the child rig; 3 reveals the adult. */
export type Grade = 1 | 2 | 3;

/** Every call is on the rig currently staged; `swapToAdult` is the only one
 *  that changes which rig that is. */
export type GachaHost = {
  style(name: string): void;
  sfx(key: string, loop?: boolean): void;
  stopSfx(): void;
  set(clip: string, loop?: boolean): void;
  queue(clip: string, loop?: boolean, onStart?: () => void): void;
  currentClip(): string | null;
  /** Drop the queue behind the current entry and make it loop. */
  loopCurrent(): void;
  swapToAdult(): Promise<void>;
  grade(): Grade;
  /** The SFX keys and FX styles differ per rig. */
  isAdult(): boolean;

  waitAnimation(): Promise<void>;
  waitTap(): Promise<void>;
  delay(ms: number): Promise<void>;
};

/** Milliseconds, as the client passes them. */
export const DWELL = {
  /** The client's ramp out of `Phase1`, which carries no interaction. */
  phase1: 100,
  /** After the adult rig's `transition_out_01` is set. */
  transition: 1300,
} as const;

async function intro(h: GachaHost): Promise<GachaState> {
  h.style('Intro1');
  h.sfx('Intro1');
  h.set('intro_cut_01');
  await h.waitAnimation();

  h.style('Intro2');
  h.sfx(h.isAdult() ? 'Intro2_Adult' : 'Intro2_Child');
  h.queue('intro_cut_02');
  await h.waitAnimation();

  h.style('Intro3');
  h.sfx('Intro3');
  h.queue('intro_cut_03');
  await h.waitAnimation();
  return 'idle';
}

async function idle(h: GachaHost): Promise<GachaState> {
  h.style('Idle');
  // The boring clip brings its own FX and SFX in, on its own start callback.
  h.queue('idle_normal');
  h.queue('idle_boring', false, () => {
    h.style('Boring');
    h.sfx(h.isAdult() ? 'Boring_Adult' : 'Boring_Child');
  });
  h.queue('idle_normal', true);
  await h.waitTap();
  return 'phase1';
}

async function phase1(h: GachaHost): Promise<GachaState> {
  h.style('Phase1');
  // The tap arrives part-way through the idle cycle, so the idle either
  // restarts or, when it is already the normal one, keeps playing on a loop
  // that drops the queued boring beat.
  if (h.currentClip() !== 'idle_normal') h.set('idle_normal', true);
  else h.loopCurrent();
  await h.delay(DWELL.phase1);
  return 'phase2';
}

async function phase2(h: GachaHost): Promise<GachaState> {
  h.style('Phase2');
  h.sfx('Phase2_Start');
  h.sfx('Phase2_Loop', true);
  h.set('touch_action_01_start');
  h.queue('touch_action_01_idle', true);
  await h.waitTap();
  return 'phase3';
}

async function phase3(h: GachaHost): Promise<GachaState> {
  h.style('Phase3');
  h.sfx('Phase3_Start');
  h.sfx('Phase3_Loop', true);
  h.set('touch_action_02_start');
  h.queue('touch_action_02_idle', true);
  await h.waitTap();
  return 'end';
}

async function end(h: GachaHost): Promise<GachaState> {
  h.stopSfx();
  if (h.grade() === 3 && !h.isAdult()) {
    h.style('Transition');
    h.sfx('Transition');
    h.set('transition_in_01');
    await h.waitAnimation();
    await h.swapToAdult();
    h.set('transition_out_01');
    await h.delay(DWELL.transition);
  }
  h.style('End');
  h.sfx('End');
  h.set('touch_action_03');
  await h.waitAnimation();
  return 'done';
}

const STATES: Record<Exclude<GachaState, 'done'>, (h: GachaHost) => Promise<GachaState>> = {
  intro, idle, phase1, phase2, phase3, end,
};

export function runState(state: GachaState, host: GachaHost): Promise<GachaState> {
  if (state === 'done') return Promise.resolve('done');
  return STATES[state](host);
}

export const STATE_LABEL: Record<GachaState, Localized> = {
  intro: { en: 'Intro', ko: '인트로' },
  idle: { en: 'Idle', ko: '대기' },
  phase1: { en: 'Phase 1', ko: '1단계' },
  phase2: { en: 'Phase 2', ko: '2단계' },
  phase3: { en: 'Phase 3', ko: '3단계' },
  end: { en: 'End', ko: '종료' },
  done: { en: 'Done', ko: '완료' },
};
