// A query route rather than a `[id]` segment: the stage list is runtime data, so a build-time path list would need regenerating.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import { Badge, Box, Flex, Text, VStack } from '@chakra-ui/react';
import { EmptyState, LoadState, MetaChips, PageHeader } from '@altterisk/game-hub';
import { GameIcon } from '@/components/gameIcon';
import { StageCrumbs } from '@/components/stageCrumbs';
import { StageMeta } from '@/components/stageMeta';
import { StageBody } from '@/components/stageWave';
import { ShareButton } from '@/components/shareButton';
import {
  DIFFICULTY_LABEL, groupByKey, modeLabel, stageById, stageName, zoneOf,
} from '@/lib/stages';
import { pick, useLang, useT } from '@/lib/i18n';
import { groupIsSpoiler, useSpoilerFacts } from '@/lib/spoilers';
import { useSpoilerGate } from '@/components/spoilers';
import {
  loadCharacters, loadIcons, loadStages,
  type CharacterData, type IconManifest, type StageData,
} from '@/lib/data';
import { Seo } from '@/components/seo';

export default function StagePage() {
  const t = useT();
  return <><Seo title={t('navStages')} noindex /><StageContent /></>;
}

function StageContent() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? Number(router.query.id) : null;

  const [data, setData] = useState<StageData | null>(null);
  const [chars, setChars] = useState<CharacterData | null>(null);
  const [icons, setIcons] = useState<IconManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStages().then(setData).catch((e) => setError(String(e)));
    loadCharacters().then(setChars).catch(() => setChars(null));
    loadIcons().then(setIcons).catch(() => setIcons(null));
  }, []);

  const stage = useMemo(
    () => (data && id != null ? stageById(data, id) : null), [data, id]);

  // The group's own ordering is what "next" means; a stage outside any listed group has no neighbours.
  const siblings = useMemo(() => {
    if (!data || !stage) return { prev: null, next: null };
    const list = groupByKey(data, stage.group)?.stages ?? [];
    const at = list.findIndex((s) => s.id === stage.id);
    return {
      prev: at > 0 ? list[at - 1] : null,
      next: at >= 0 && at < list.length - 1 ? list[at + 1] : null,
    };
  }, [data, stage]);

  const facts = useSpoilerFacts();
  const group = data && stage ? data.groups[stage.group] : null;
  const gated = useSpoilerGate(data && facts && router.isReady ? !!group && groupIsSpoiler(group, facts) : null, '/stages');

  if (error || !data || !router.isReady || gated) {
    return <LoadState loading error={error} labels={{ loading: t('loading'), error }} />;
  }

  if (!stage) {
    return (
      <EmptyState title={id != null ? t('stageNotFound', { id }) : t('stageNoneSelected')}
        action={<Text as={NextLink} href="/stages" color="yellow.300" fontSize="sm">{t('stageBack')}</Text>} />
    );
  }

  const zone = zoneOf(data, stage);

  return (
    <VStack align="stretch" spacing={4}>
      <StageCrumbs data={data} mode={stage.mode} group={data.groups[stage.group]}
        leaf={stageName(data, stage, lang)} lang={lang} />

      <PageHeader level={2}
        art={<GameIcon manifest={icons} group="zone" name={zone?.image}
          boxSize={{ base: '56px', md: '72px' }} borderRadius="md" objectFit="cover"
          reserve={false} />}
        title={stageName(data, stage, lang)} id={stage.id}
        badges={
          <>
            <Badge>{modeLabel(data, stage.mode, lang)}</Badge>
            {zone?.difficulty && (
              <Badge colorScheme={zone.difficulty === 'normal' ? 'gray' : 'red'}>
                {pick(DIFFICULTY_LABEL[zone.difficulty], lang)}
              </Badge>
            )}
          </>
        }
        meta={<MetaChips><StageMeta stage={stage} chars={chars} icons={icons} lang={lang} /></MetaChips>}
        actions={<ShareButton query={{ id: stage.id }} />} />

      {(siblings.prev || siblings.next) && (
        <Flex align="center" gap={3} wrap="wrap" fontSize="sm">
          {siblings.prev && (
            <Text as={NextLink} href={`/stage?id=${siblings.prev.id}`} color="yellow.300"
              noOfLines={1}>
              ← {stageName(data, siblings.prev, lang)}
            </Text>
          )}
          <Box flex="1" />
          {siblings.next && (
            <Text as={NextLink} href={`/stage?id=${siblings.next.id}`} color="yellow.300"
              noOfLines={1}>
              {stageName(data, siblings.next, lang)} →
            </Text>
          )}
        </Flex>
      )}

      <StageBody stage={stage} data={data} chars={chars} icons={icons} lang={lang} />
    </VStack>
  );
}
