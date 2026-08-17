import { useEffect } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import Layout from '@/components/Layout';
import { restoreLang } from '@/lib/i18n';
import { restoreFarm } from '@/lib/farmStore';
import { restoreCollection } from '@/lib/collectionStore';
import { restoreTutorial } from '@/lib/tutorialStore';

const theme = extendTheme({
  config: { initialColorMode: 'dark', useSystemColorMode: false },
  colors: {
    gray: {
      50: '#f7f8fb',
      100: '#eceef4',
      200: '#d8dce7',
      300: '#b7bece',
      400: '#929bad',
      500: '#707a8f',
      600: '#515b70',
      700: '#353d4d',
      800: '#1b2230',
      900: '#0b0f17',
    },
    yellow: {
      50: '#fff9e6',
      100: '#ffefb8',
      200: '#ffe487',
      300: '#ffd65a',
      400: '#f6c445',
      500: '#dca629',
      600: '#af7d1c',
      700: '#805716',
      800: '#563911',
      900: '#321f0a',
    },
  },
  fonts: {
    heading: 'Inter, Pretendard, "Noto Sans KR", system-ui, sans-serif',
    body: 'Inter, Pretendard, "Noto Sans KR", system-ui, sans-serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
  radii: {
    md: '0.625rem',
    lg: '0.875rem',
    xl: '1.125rem',
  },
  shadows: {
    outline: '0 0 0 3px rgba(246, 196, 69, 0.28)',
    panel: '0 18px 45px rgba(0, 0, 0, 0.22)',
  },
  styles: {
    global: {
      'html, body, #__next': { minH: '100%' },
      body: {
        bg: 'gray.900',
        bgImage: 'radial-gradient(circle at 12% -10%, rgba(246, 196, 69, 0.08), transparent 30rem), radial-gradient(circle at 92% 18%, rgba(66, 153, 225, 0.06), transparent 28rem)',
        bgAttachment: 'fixed',
        color: 'gray.100',
        overflowX: 'hidden',
        textRendering: 'optimizeLegibility',
      },
      '::selection': { bg: 'yellow.300', color: 'gray.900' },
      '*': { scrollbarColor: '#515b70 transparent', scrollbarWidth: 'thin' },
      '::-webkit-scrollbar': { width: '8px', height: '8px' },
      '::-webkit-scrollbar-thumb': { bg: 'gray.600', borderRadius: 'full' },
      '::-webkit-scrollbar-track': { bg: 'transparent' },
      'a, button, input, select, textarea': {
        WebkitTapHighlightColor: 'transparent',
      },
      'a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible': {
        outline: '2px solid',
        outlineColor: 'yellow.300',
        outlineOffset: '2px',
      },
      '@media (prefers-reduced-motion: reduce)': {
        '*, *::before, *::after': {
          scrollBehavior: 'auto !important',
          transitionDuration: '0.01ms !important',
          animationDuration: '0.01ms !important',
          animationIterationCount: '1 !important',
        },
      },
    },
  },
  components: {
    Badge: {
      baseStyle: {
        borderRadius: 'full',
        fontWeight: '700',
        letterSpacing: '0.01em',
        px: 2,
        py: 0.5,
      },
    },
    Button: {
      baseStyle: {
        borderRadius: 'lg',
        fontWeight: '700',
        transitionProperty: 'background, border-color, color, box-shadow, transform',
        transitionDuration: '160ms',
      },
    },
    Input: {
      variants: {
        filled: {
          field: {
            bg: 'whiteAlpha.100',
            borderWidth: '1px',
            borderColor: 'whiteAlpha.200',
            _hover: { bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.300' },
            _focusVisible: { bg: 'gray.800', borderColor: 'yellow.400', boxShadow: 'outline' },
          },
        },
      },
      defaultProps: { variant: 'filled' },
    },
    Select: {
      variants: {
        filled: {
          field: {
            bg: 'whiteAlpha.100',
            borderWidth: '1px',
            borderColor: 'whiteAlpha.200',
            _hover: { bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.300' },
            _focusVisible: { bg: 'gray.800', borderColor: 'yellow.400', boxShadow: 'outline' },
          },
        },
      },
      defaultProps: { variant: 'filled' },
    },
    Tabs: {
      baseStyle: {
        tab: {
          color: 'gray.400',
          fontWeight: '700',
          borderRadius: 'md md 0 0',
          _hover: { color: 'gray.100', bg: 'whiteAlpha.50' },
          _selected: { color: 'yellow.300' },
        },
      },
      defaultProps: { colorScheme: 'yellow' },
    },
    Tooltip: {
      baseStyle: {
        bg: 'gray.700',
        color: 'gray.50',
        borderRadius: 'md',
        boxShadow: 'lg',
        px: 3,
        py: 2,
      },
    },
  },
});

export default function App({ Component, pageProps }: AppProps) {
  useEffect(restoreLang, []);
  useEffect(restoreFarm, []);
  useEffect(restoreCollection, []);
  useEffect(restoreTutorial, []);
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
