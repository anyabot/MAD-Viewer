// Fetches the cutscene index, then mounts the Pixi/Spine host. Kept apart from
// the viewer itself so the gallery page can drop it into a tab.

import { Spinner, Text } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import { loadGachaIndex, type GachaIndex } from '@/lib/data';

// Pixi and the Spine runtime are browser-only.
const GachaViewer = dynamic(() => import('@/components/gachaViewer'), { ssr: false });

export default function GachaScene() {
  const [index, setIndex] = useState<GachaIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGachaIndex()
      .then((data) => { if (!cancelled) setIndex(data); })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <Text color="red.300" fontSize="sm">{error}</Text>;
  if (!index) return <Spinner color="gray.400" />;
  return <GachaViewer index={index} />;
}
