import { useEffect, useState } from 'react';
import { loadSkillTiming, type SkillTiming } from '@/lib/data';

let bySkill: Promise<Record<string, SkillTiming>> | null = null;

// Skill ids are unique across characters, so one flat map serves every page.
export function useSkillTiming(): Record<string, SkillTiming> | null {
  const [map, setMap] = useState<Record<string, SkillTiming> | null>(null);
  useEffect(() => {
    bySkill ??= loadSkillTiming().then((d) => Object.assign({}, ...Object.values(d.characters)));
    bySkill.then(setMap).catch(() => setMap(null));
  }, []);
  return map;
}
