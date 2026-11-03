import { useEffect, useLayoutEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { Toaster } from '@altterisk/game-hub/ui';
import '@altterisk/game-hub/ui-reset.css';
import '@altterisk/game-hub/ui.css';
import '@altterisk/game-hub/hub.css';
import '@altterisk/game-hub/components.css';
import '@/styles/site.css';
import Layout from '@/components/Layout';
import { Seo } from '@/components/seo';
import { dataText, restoreLang, useLangStore } from '@/lib/i18n';
import { setTextResolver } from '@/lib/characters';
import { restoreGameLang, useGameLang } from '@/lib/gameText';
import { restoreFarm } from '@/lib/farmStore';
import { restoreCollection } from '@/lib/collectionStore';
import { restoreParty } from '@/lib/partyStore';
import { restoreSkillView } from '@/lib/skillViewStore';
import { restoreSeen } from '@/lib/seenStore';
import { restoreSpoilers } from '@/lib/spoilers';
import { startSync } from '@/lib/sync';

const ChangelogDialog = dynamic(() => import('@/components/changelog').then((m) => m.ChangelogDialog), { ssr: false });

setTextResolver(dataText);

const KOREAN_FONT = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=optional';

// The stylesheet alone is 90 KiB, so only a visitor reading Korean pays for it.
function useKoreanFont(wanted: boolean) {
  useEffect(() => {
    if (!wanted || document.querySelector(`link[href="${KOREAN_FONT}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = KOREAN_FONT;
    document.head.appendChild(link);
  }, [wanted]);
}

export default function App({ Component, pageProps }: AppProps) {
  const [restored, setRestored] = useState(false);
  useEffect(restoreLang, []);
  useEffect(restoreGameLang, []);
  useEffect(restoreFarm, []);
  useEffect(restoreCollection, []);
  useEffect(restoreParty, []);
  useEffect(restoreSkillView, []);
  useEffect(restoreSeen, []);
  useEffect(restoreSpoilers, []);
  // batched with the restores above, so the content reveals on the render that applies them
  useEffect(() => setRestored(true), []);
  useLayoutEffect(() => { if (restored) document.documentElement.removeAttribute('data-restoring'); }, [restored]);
  useEffect(startSync, []);
  const lang = useLangStore((s) => s.lang);
  const gameLang = useGameLang();
  useKoreanFont(lang === 'ko' || gameLang === 'ko');
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Seo />
      <Layout>
        <ChangelogDialog />
        <Component {...pageProps} />
      </Layout>
      <Toaster />
    </>
  );
}
