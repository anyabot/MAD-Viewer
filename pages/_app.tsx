import { useEffect } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import Layout from '@/components/Layout';
import { restoreLang } from '@/lib/i18n';
import { restoreFarm } from '@/lib/farmStore';

const theme = extendTheme({
  config: { initialColorMode: 'dark', useSystemColorMode: false },
  styles: {
    global: {
      body: { bg: 'gray.900', color: 'gray.100' },
      // The browser's own selection keeps the text colour, which hides the dim
      // greys used for secondary text, so this paints both.
      '::selection': { bg: 'yellow.300', color: 'gray.900' },
    },
  },
});

export default function App({ Component, pageProps }: AppProps) {
  // After mount, so the exported HTML and the first client render agree.
  useEffect(restoreLang, []);
  useEffect(restoreFarm, []);
  return (
    <ChakraProvider theme={theme}>
      <Head>
        <title>MAD Viewer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </ChakraProvider>
  );
}
