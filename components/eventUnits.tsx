import { useMemo, useState } from 'react';
import { Select } from '@altterisk/game-hub/ui';

import EventBoxArt from '@/components/eventBoxArt';
import { characterName } from '@/lib/characters';
import type { CharacterData, EventArt } from '@/lib/data';
import { useLang } from '@/lib/i18n';

// One of the event's own unit rigs at a time; the surface lays every rig out in a single row.
export default function EventUnits({ art, chars }: { art: EventArt; chars: CharacterData | null }) {
  const lang = useLang();
  const units = useMemo(() => art.units ?? [], [art]);
  const [asset, setAsset] = useState(units[0]?.asset ?? '');
  const shown = useMemo(() => ({
    key: art.key, rigs: units.filter((u) => u.asset === asset), chibis: [], stickers: [],
  }), [art.key, units, asset]);
  const label = (code?: string) => {
    const entry = code ? chars?.characters[code] ?? null : null;
    return entry ? `${characterName(entry, lang)} (${code})` : code ?? '';
  };
  if (!units.length) return null;
  return (
    <>
      <Select size="sm" maxW="sm" mb={2} value={asset} onChange={(e) => setAsset(e.target.value)}>
        {units.map((u) => <option key={u.asset} value={u.asset}>{label(u.code)}</option>)}
      </Select>
      <EventBoxArt art={shown} />
    </>
  );
}
