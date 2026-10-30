import { Text } from '@altterisk/game-hub/ui';
import { MetaChip } from '@altterisk/game-hub';
import { GameIcon } from '@/components/gameIcon';
import { typeLabel } from '@/lib/characters';
import { levelRange } from '@/lib/stages';
import { useT, type Lang } from '@/lib/i18n';
import type { CharacterData, IconManifest, StageEntry } from '@/lib/data';

export function StageMeta({ stage, chars, icons, lang }: {
  stage: StageEntry; chars: CharacterData | null; icons: IconManifest | null; lang: Lang;
}) {
  const t = useT();
  const levels = levelRange(stage);
  const weak = stage.weakAttribute != null && chars
    ? chars.types.attribute[String(stage.weakAttribute)] ?? null
    : null;
  return (
    <>
      {stage.recommendLevel && <MetaChip value={t('stageRecommend', { level: stage.recommendLevel })} />}
      {weak && (
        <MetaChip label={t('stageWeakTo')}
          icon={<GameIcon manifest={icons} group="ui" name={weak.icon} size={4} reserve={false} />}
          value={<Text as="span" color={weak.color ?? 'gray.300'}>{typeLabel(weak, lang)}</Text>} />
      )}
      {stage.stamina ? <MetaChip value={t('stageStamina', { n: stage.stamina })} /> : null}
      <MetaChip value={t('stageWaves', { n: stage.waves.length })} />
      {levels && (
        <MetaChip value={levels[0] === levels[1]
          ? t('stageLevel', { n: levels[0] })
          : t('stageLevelRange', { from: levels[0], to: levels[1] })} />
      )}
    </>
  );
}
