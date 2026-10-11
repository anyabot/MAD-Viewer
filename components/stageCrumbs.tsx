import { Breadcrumbs, type Crumb } from '@altterisk/game-hub';
import { groupLabel, modeLabel } from '@/lib/stages';
import { useT, type Lang } from '@/lib/i18n';
import { nextLink } from '@/lib/hubLink';
import type { StageData, StageGroup } from '@/lib/data';

export function StageCrumbs({ data, mode, group, leaf, lang }: {
  data: StageData; mode: string; group?: StageGroup;
  leaf?: string;
  lang: Lang;
}) {
  const t = useT();
  const groupHref = `/stages?group=${encodeURIComponent(group?.key ?? '')}`;
  const items: Crumb[] = [{ label: t('stageAllModes'), href: '/stages' }, { label: modeLabel(data, mode, lang), href: group ? `/stages?mode=${mode}` : undefined }];
  if (group) items.push({ label: groupLabel(data, group, lang), href: leaf ? groupHref : undefined });
  if (leaf) items.push({ label: leaf });
  return <Breadcrumbs items={items} renderLink={nextLink} label={t('breadcrumb')} />;
}
