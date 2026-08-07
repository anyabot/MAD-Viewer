// The stage trail, shared by the list levels and the stage page so a stage
// links back to the list it belongs to and not only to the hub.
import NextLink from 'next/link';
import { Text, Wrap, WrapItem } from '@chakra-ui/react';
import { groupLabel, modeLabel } from '@/lib/stages';
import { useT, type Lang } from '@/lib/i18n';
import type { StageData, StageGroup } from '@/lib/data';

export function StageCrumbs({ data, mode, group, leaf, lang }: {
  data: StageData; mode: string; group?: StageGroup;
  /** The stage's own name; the group becomes a link once it is given. */
  leaf?: string;
  lang: Lang;
}) {
  const t = useT();
  const groupHref = `/stages?group=${encodeURIComponent(group?.key ?? '')}`;
  return (
    <Wrap spacing={2} align="center" fontSize="sm">
      <WrapItem>
        <Text as={NextLink} href="/stages" color="yellow.300">{t('stageAllModes')}</Text>
      </WrapItem>
      <WrapItem><Text color="gray.600">/</Text></WrapItem>
      <WrapItem>
        {group ? (
          <Text as={NextLink} href={`/stages?mode=${mode}`} color="yellow.300">
            {modeLabel(data, mode, lang)}
          </Text>
        ) : (
          <Text color="gray.400">{modeLabel(data, mode, lang)}</Text>
        )}
      </WrapItem>
      {group && (
        <>
          <WrapItem><Text color="gray.600">/</Text></WrapItem>
          <WrapItem>
            {leaf ? (
              <Text as={NextLink} href={groupHref} color="yellow.300">
                {groupLabel(data, group, lang)}
              </Text>
            ) : (
              <Text color="gray.400">{groupLabel(data, group, lang)}</Text>
            )}
          </WrapItem>
        </>
      )}
      {leaf && (
        <>
          <WrapItem><Text color="gray.600">/</Text></WrapItem>
          <WrapItem><Text color="gray.400">{leaf}</Text></WrapItem>
        </>
      )}
    </Wrap>
  );
}
