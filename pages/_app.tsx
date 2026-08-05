import type { AppProps } from 'next/app';
import Head from 'next/head';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import Layout from '@/components/Layout';

const theme = extendTheme({
  config: { initialColorMode: 'dark', useSystemColorMode: false },
  styles: {
    global: {
      // The viewer canvas is dark; keep the shell dark so it does not flash.
      body: { bg: 'gray.900', color: 'gray.100' },
      // Dim greys are used throughout for secondary text (asset keys, codes,
      // captions). The browser's own selection keeps the text colour, which
      // hides those runs entirely, so the selection paints both.
      '::selection': { bg: 'yellow.300', color: 'gray.900' },
    },
  },
});

export default function App({ Component, pageProps }: AppProps) {
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
