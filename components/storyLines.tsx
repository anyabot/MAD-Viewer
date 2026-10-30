import { useMemo } from 'react';
import NextLink from 'next/link';
import { Box, IconButton } from '@altterisk/game-hub/ui';
import { StoryLines, routerLinks, type StoryLineView } from '@altterisk/game-hub';
import { RichText, replaceTag, type MarkupRule } from '@altterisk/game-hub/text';
import { GameIcon } from '@/components/gameIcon';
import type { CharacterData, IconManifest, StoryLine } from '@/lib/data';
import type { GameLang } from '@/lib/gameText';
import { text, useLang, useT } from '@/lib/i18n';
import { playVoice, type VoiceIndex } from '@/lib/voice';
import { characterHref } from '@/lib/routes';

const EMPHASIS = { textEmphasis: 'filled dot', WebkitTextEmphasis: 'filled dot', textEmphasisPosition: 'over right' };
const nextLinks = routerLinks(NextLink);

function useLineRules(): MarkupRule[] {
  const lang = useLang();
  return useMemo(() => [
    replaceTag(/\{player\}/, () => (
      <Box as="span" color="accent.300" fontWeight="semibold">{text(lang, 'storyPlayer')}</Box>
    )),
    replaceTag(/<bouten>([\s\S]*?)<\/bouten>/, (m, inner) => <Box as="span" style={EMPHASIS}>{inner(m[1])}</Box>),
    replaceTag(/<ruby=(?:"([^"]*)"|([^>]*))>([\s\S]*?)<\/ruby>/, (m, inner) => (
      <ruby>{inner(m[3])}<Box as="rt" fontSize="0.6em" color="gray.400">{m[1] ?? m[2]}</Box></ruby>
    )),
  ], [lang]);
}

export function LineText({ text: value }: { text: string }) {
  return <RichText text={value} rules={useLineRules()} />;
}

export function SceneLines({ lines, chars, icons, voice, lang }: {
  lines: StoryLine[]; chars: CharacterData | null; icons: IconManifest | null;
  voice: VoiceIndex | null; lang: GameLang;
}) {
  const t = useT();
  const views = lines.map((line): StoryLineView => {
    if (line.k === 'place' || line.k === 'narration' || line.k === 'choice') {
      return { kind: line.k, text: <LineText text={line.t} /> };
    }
    const entry = line.c ? chars?.characters[line.c] : undefined;
    const playable = entry?.characterType === 1;
    return {
      kind: 'say',
      text: <LineText text={line.t} />,
      name: line.n || undefined,
      nameHref: playable && line.c ? characterHref(line.c) : undefined,
      highlight: playable,
      avatar: (
        <GameIcon manifest={icons} group="char"
          names={line.c ? [entry?.iconPath, `Icon_${line.c}`] : []}
          size={8} borderRadius="full" mt={0.5} />
      ),
      action: line.v && voice?.clips[line.v] ? (
        <IconButton aria-label={t('storyPlayVoice')} size="xs" variant="ghost"
          icon={<Box as="span" aria-hidden>▶</Box>}
          onClick={() => { void playVoice(voice, line.v!); }} />
      ) : undefined,
    };
  });
  return (
    <Box maxW="48rem" mx="auto">
      <StoryLines lines={views} lang={lang} empty={t('storyNoText')} renderLink={nextLinks} />
    </Box>
  );
}
