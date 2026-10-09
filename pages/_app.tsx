import { useEffect } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { accentScale, getGame } from '@altterisk/game-hub';
import { hubChakraTheme } from '@altterisk/game-hub/chakra';
import '@altterisk/game-hub/hub.css';
import Layout from '@/components/Layout';
import { dataText, restoreLang } from '@/lib/i18n';
import { setTextResolver } from '@/lib/characters';
import { restoreGameLang } from '@/lib/gameText';
import { restoreFarm } from '@/lib/farmStore';
import { restoreCollection } from '@/lib/collectionStore';
import { restoreSeen } from '@/lib/seenStore';
import { ChangelogDialog } from '@/components/changelog';

setTextResolver(dataText);

const theme = extendTheme(hubChakraTheme('mad'), {
  colors: {
    yellow: accentScale(getGame('mad').accent),
  },
  components: {
    Badge: { defaultProps: { colorScheme: 'gray' } },
  },
  styles: {
    global: {
      body: {
        bgImage: 'radial-gradient(circle at 12% -10%, rgba(246, 196, 69, 0.08), transparent 30rem), radial-gradient(circle at 92% 18%, rgba(66, 153, 225, 0.06), transparent 28rem)',
        bgAttachment: 'fixed',
      },
    },
  },
});

export default function App({ Component, pageProps }: AppProps) {
  useEffect(restoreLang, []);
  useEffect(restoreGameLang, []);
  useEffect(restoreFarm, []);
  useEffect(restoreCollection, []);
  useEffect(restoreSeen, []);
  return (
    <ChakraProvider theme={theme}>
      <Head>
        <title>MAD Viewer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Layout>
        <ChangelogDialog />
        <Component {...pageProps} />
      </Layout>
    </ChakraProvider>
  );
}
