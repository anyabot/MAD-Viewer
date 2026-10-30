import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Seo } from '@/components/seo';
import {
  Badge, Box, Center, Flex, HStack, IconButton, SimpleGrid, Slider, SliderFilledTrack, SliderThumb,
  SliderTrack, Spinner, Text, VStack,
} from '@altterisk/game-hub/ui';
import { Panel } from '@altterisk/game-hub';
import { loadSceneAudio } from '@/lib/data';
import { Jukebox } from '@/lib/jukebox';
import type { BgmTrack } from '@/lib/sceneAudio';
import { pick, useLang, useT, type Localized } from '@/lib/i18n';

const GROUP_LABEL: Record<string, Localized> = {
  outgame: { en: 'Menus', ko: '메뉴' },
  story: { en: 'Story', ko: '스토리' },
  battle: { en: 'Battle', ko: '전투' },
  event: { en: 'Event', ko: '이벤트' },
  faction: { en: 'Faction', ko: '세력' },
  character: { en: 'Character', ko: '캐릭터' },
  romance: { en: 'Romance', ko: '로맨스' },
};

function groupLabel(group: string, lang: 'en' | 'ko'): string {
  return GROUP_LABEL[group] ? pick(GROUP_LABEL[group], lang) : group;
}

function trackLabel(track: BgmTrack): string {
  return track.id.replace(`bgm_${track.group}_`, '').replace(/_/g, ' ');
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function JukeboxPage() {
  const t = useT();
  const lang = useLang();
  const [tracks, setTracks] = useState<BgmTrack[] | null>(null);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [repeat, setRepeat] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const player = useRef<Jukebox | null>(null);
  const seeking = useRef(false);

  useEffect(() => {
    loadSceneAudio().then((d) => setTracks(d.bgm ?? [])).catch(() => setError(true));
    return () => {
      player.current?.stop();
      void player.current?.pause();
    };
  }, []);

  const groups = useMemo(() => {
    const out = new Map<string, BgmTrack[]>();
    for (const track of tracks ?? []) out.set(track.group, [...(out.get(track.group) ?? []), track]);
    return Array.from(out);
  }, [tracks]);

  const jukebox = useCallback(() => {
    if (!player.current) {
      player.current = new Jukebox();
      player.current.volume = volume;
      player.current.repeat = repeat;
    }
    return player.current;
  }, [volume, repeat]);

  const play = useCallback(async (track: BgmTrack) => {
    const box = jukebox();
    setCurrent(track.id);
    setFailed(null);
    setLoading(true);
    setPosition(0);
    setDuration(track.seconds);
    try {
      await box.play(track);
      setDuration(box.duration);
      setPaused(false);
    } catch {
      setFailed(track.id);
    } finally {
      setLoading(false);
    }
  }, [jukebox]);

  const step = useCallback((delta: number) => {
    if (!tracks?.length) return;
    const index = tracks.findIndex((track) => track.id === current);
    void play(tracks[(index + delta + tracks.length) % tracks.length]);
  }, [tracks, current, play]);

  useEffect(() => {
    if (player.current) player.current.onEnded = () => step(1);
  }, [step, current]);

  useEffect(() => {
    if (!current || paused || loading) return;
    let frame = 0;
    const tick = () => {
      if (player.current && !seeking.current) setPosition(player.current.position);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current, paused, loading]);

  const toggle = async () => {
    const box = player.current;
    if (!box) return;
    if (box.paused) await box.resume();
    else await box.pause();
    setPaused(box.paused);
  };

  if (error) return <Text color="red.400">{t('jukeboxFailed')}</Text>;
  if (!tracks) {
    return (
      <Center py={20}>
        <VStack><Spinner /><Text fontSize="sm" color="gray.500">{t('loading')}</Text></VStack>
      </Center>
    );
  }
  const playing = tracks.find((track) => track.id === current) ?? null;

  return (
    <VStack align="stretch" spacing={5}>
      <Seo title={t('navJukebox')} description={t('seoDescJukebox')} />
      <Flex align="baseline" gap={3} wrap="wrap">
        <Text fontSize="2xl" fontWeight="bold">{t('navJukebox')}</Text>
        <Text fontSize="sm" color="gray.500">{t('jukeboxTracks', { n: tracks.length })}</Text>
      </Flex>
      {groups.map(([group, list]) => (
        <Panel key={group} title={groupLabel(group, lang)} note={String(list.length)}>
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing={2}>
            {list.map((track) => {
              const active = track.id === current;
              return (
                <Flex key={track.id} as="button" type="button" onClick={() => { void play(track); }}
                  gap={2} align="center" p={2} borderRadius="md" textAlign="left" minW={0}
                  borderWidth="1px" borderColor={active ? 'accent.400' : 'transparent'}
                  bg={active ? 'whiteAlpha.100' : 'whiteAlpha.50'} _hover={{ bg: 'whiteAlpha.100' }}>
                  <Box as="span" aria-hidden w={4} flexShrink={0} color={active ? 'accent.300' : 'gray.400'}>
                    {active && loading ? <Spinner size="xs" /> : '▶'}
                  </Box>
                  <Text fontSize="sm" fontFamily="mono" noOfLines={1} flex="1" minW={0}>
                    {trackLabel(track)}
                  </Text>
                  {track.intro && (
                    <Badge fontSize="0.55rem" textTransform="none">{t('jukeboxIntro')}</Badge>
                  )}
                  <Text fontSize="xs" color="gray.500" flexShrink={0}>{clock(track.seconds)}</Text>
                </Flex>
              );
            })}
          </SimpleGrid>
        </Panel>
      ))}
      {playing && (
        <Box position="sticky" bottom={{ base: 2, md: 4 }} zIndex={10} p={3}
          borderWidth="1px" borderColor="whiteAlpha.300" borderRadius="lg"
          bg="gray.900" boxShadow="dark-lg">
          <Flex gap={3} align="center" wrap="wrap">
            <HStack spacing={1}>
              <IconButton aria-label={t('jukeboxPrev')} size="sm" variant="ghost"
                icon={<Box as="span" aria-hidden>⏮</Box>} onClick={() => step(-1)} />
              <IconButton aria-label={paused ? t('jukeboxPlay') : t('jukeboxPause')} size="sm"
                colorScheme="accent" isDisabled={loading || failed === playing.id}
                icon={<Box as="span" aria-hidden>{paused ? '▶' : '❚❚'}</Box>}
                onClick={() => { void toggle(); }} />
              <IconButton aria-label={t('jukeboxNext')} size="sm" variant="ghost"
                icon={<Box as="span" aria-hidden>⏭</Box>} onClick={() => step(1)} />
              <IconButton aria-label={t('jukeboxRepeat')} title={t('jukeboxRepeat')} size="sm"
                variant={repeat ? 'solid' : 'ghost'} aria-pressed={repeat}
                icon={<Box as="span" aria-hidden>🔁</Box>}
                onClick={() => {
                  setRepeat(!repeat);
                  if (player.current) player.current.repeat = !repeat;
                }} />
            </HStack>
            <Box minW={0} flex={{ base: '1 1 8rem', md: '0 1 14rem' }}>
              <Text fontSize="xs" color="gray.400">{groupLabel(playing.group, lang)}</Text>
              <Text fontSize="sm" fontFamily="mono" noOfLines={1}>{trackLabel(playing)}</Text>
            </Box>
            <Flex flex="1 1 16rem" minW="12rem" align="center" gap={2}>
              <Text fontSize="xs" color="gray.400" minW="2.5rem" textAlign="right">{clock(position)}</Text>
              {failed === playing.id ? (
                <Text fontSize="sm" color="red.400" flex="1">{t('jukeboxFailed')}</Text>
              ) : (
                <Slider aria-label={t('jukeboxSeek')} flex="1" min={0} max={duration || 1} step={0.1}
                  value={Math.min(position, duration)} focusThumbOnChange={false}
                  isDisabled={loading}
                  onChange={(value) => { seeking.current = true; setPosition(value); }}
                  onChangeEnd={(value) => {
                    seeking.current = false;
                    player.current?.seek(value);
                    setPosition(value);
                  }}>
                  <SliderTrack bg="whiteAlpha.200"><SliderFilledTrack bg="accent.400" /></SliderTrack>
                  <SliderThumb boxSize={3} />
                </Slider>
              )}
              <Text fontSize="xs" color="gray.400" minW="2.5rem">{clock(duration)}</Text>
            </Flex>
            <Slider aria-label={t('jukeboxVolume')} w={{ base: 'full', md: '6rem' }} min={0} max={1}
              step={0.01} value={volume}
              onChange={(value) => {
                setVolume(value);
                if (player.current) player.current.volume = value;
              }}>
              <SliderTrack bg="whiteAlpha.200"><SliderFilledTrack bg="gray.300" /></SliderTrack>
              <SliderThumb boxSize={3} />
            </Slider>
          </Flex>
        </Box>
      )}
    </VStack>
  );
}
