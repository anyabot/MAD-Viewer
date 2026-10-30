import { useEffect } from 'react';
import type { AppProps } from 'next/app';
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
import { restoreGameLang } from '@/lib/gameText';
import { restoreFarm } from '@/lib/farmStore';
import { restoreCollection } from '@/lib/collectionStore';
import { restoreParty } from '@/lib/partyStore';
import { restoreSkillView } from '@/lib/skillViewStore';
import { restoreSeen } from '@/lib/seenStore';
import { restoreSpoilers } from '@/lib/spoilers';
import { ChangelogDialog } from '@/components/changelog';

setTextResolver(dataText);

export default function App({ Component, pageProps }: AppProps) {
  useEffect(restoreLang, []);
  useEffect(restoreGameLang, []);
  useEffect(restoreFarm, []);
  useEffect(restoreCollection, []);
  useEffect(restoreParty, []);
  useEffect(restoreSkillView, []);
  useEffect(restoreSeen, []);
  useEffect(restoreSpoilers, []);
  const lang = useLangStore((s) => s.lang);
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
