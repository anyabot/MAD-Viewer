import { createPersisted } from '@altterisk/game-hub/persist';
import { create } from 'zustand';
import { parsePlan, useFarm } from '@/lib/farmStore';
import { emptyPlan, type UnitPlan } from '@/lib/farm';

export const PARTY_SIZE = 5;
export const NEMESIS_TEAMS = 3;

// `sync` reads and writes the Planner's current state instead of `plan`.
export type PartyMember = { code: string; plan: UnitPlan; sync?: true };

export type Team = { id: string; name: string; units: PartyMember[] };

// The friend slot sits in one team; `code` null leaves the unit unchosen.
export type FriendSlot = { team: number; code: string | null };

export type NemesisGroup = {
  id: string; name: string; boss: string; attribute: number; teams: PartyMember[][];
  friend: FriendSlot | null;
};

export type TeamKind = 'general' | 'arena';

type PartyState = { general: Team[]; arena: Team[]; nemesis: NemesisGroup[] };

type PartyStore = PartyState & {
  ready: boolean;
  setTeams: (kind: TeamKind, teams: Team[]) => void;
  setGroups: (groups: NemesisGroup[]) => void;
};

const EMPTY: PartyState = { general: [], arena: [], nemesis: [] };

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function members(value: unknown): PartyMember[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: PartyMember[] = [];
  for (const raw of value) {
    const code = (raw as PartyMember)?.code;
    if (typeof code !== 'string' || !code || seen.has(code) || out.length >= PARTY_SIZE) continue;
    seen.add(code);
    out.push({
      code, plan: parsePlan((raw as PartyMember).plan),
      ...((raw as PartyMember).sync === true ? { sync: true as const } : {}),
    });
  }
  return out;
}

function team(value: unknown): Team {
  const raw = (value ?? {}) as Partial<Team>;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : '',
    units: members(raw.units),
  };
}

// No own unit in two teams; a later repeat is dropped. The friend needs a free slot in its team.
function group(value: unknown): NemesisGroup {
  const raw = (value ?? {}) as Partial<NemesisGroup>;
  const used = new Set<string>();
  const teams = Array.from({ length: NEMESIS_TEAMS }, (_, i) => members(raw.teams?.[i])
    .filter((m) => !used.has(m.code) && !!used.add(m.code)));
  const f = raw.friend;
  const at = typeof f?.team === 'number' ? Math.floor(f.team) : -1;
  const code = typeof f?.code === 'string' && f.code ? f.code : null;
  const friend = at >= 0 && at < NEMESIS_TEAMS && teams[at].length < PARTY_SIZE
    ? { team: at, code: code && !teams[at].some((m) => m.code === code) ? code : null }
    : null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : '',
    boss: typeof raw.boss === 'string' ? raw.boss : '',
    attribute: typeof raw.attribute === 'number' ? raw.attribute : 0,
    teams,
    friend,
  };
}

function sanitize(raw: unknown): PartyState {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PartyState, unknown[]>>;
  const list = <T, >(v: unknown, f: (x: unknown) => T): T[] => (Array.isArray(v) ? v.map(f) : []);
  return {
    general: list(doc.general, team),
    arena: list(doc.arena, team),
    nemesis: list(doc.nemesis, group),
  };
}

const stored = createPersisted<PartyState>({
  key: 'mad.party', version: 1, empty: () => EMPTY, sanitize,
});

export const useParty = create<PartyStore>((set) => ({
  ...EMPTY,
  ready: false,
  setTeams: (kind, teams) => set((s) => {
    const next = { general: s.general, arena: s.arena, nemesis: s.nemesis, [kind]: teams };
    stored.save(next);
    return { [kind]: teams };
  }),
  setGroups: (groups) => set((s) => {
    stored.save({ general: s.general, arena: s.arena, nemesis: groups });
    return { nemesis: groups };
  }),
}));

export function restoreParty(): void {
  useParty.setState({ ...stored.load(), ready: true });
}

const CODE_PREFIX = 'MADP1.';

export type ShareDoc = { team: Team } | { group: NemesisGroup };

function toBase64Url(text: string): string {
  let bin = '';
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function memberPlan(m: PartyMember, units = useFarm.getState().units): UnitPlan {
  return m.sync ? units[m.code]?.current ?? emptyPlan() : m.plan;
}

// A code carries the sharer's investment as a fixed copy.
const frozen = (units: PartyMember[]) => units.map((m) => ({ code: m.code, plan: memberPlan(m) }));

export function shareCode(doc: ShareDoc): string {
  const body = 'team' in doc
    ? { t: { n: doc.team.name, u: frozen(doc.team.units) } }
    : {
      g: {
        n: doc.group.name, b: doc.group.boss, a: doc.group.attribute, t: doc.group.teams.map(frozen),
        f: doc.group.friend,
      },
    };
  return CODE_PREFIX + toBase64Url(JSON.stringify(body));
}

export function readShareCode(text: string): ShareDoc | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) return null;
  try {
    const body = JSON.parse(fromBase64Url(trimmed.slice(CODE_PREFIX.length)));
    if (body?.t) return { team: team({ name: body.t.n, units: body.t.u }) };
    if (body?.g) {
      return {
        group: group({ name: body.g.n, boss: body.g.b, attribute: body.g.a, teams: body.g.t, friend: body.g.f }),
      };
    }
  } catch {
    return null;
  }
  return null;
}
