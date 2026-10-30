import { Html, Head, Main, NextScript } from 'next/document';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function Document() {
  return (
    <Html lang="en" data-game="mad">
      <Head>
        <link rel="icon" type="image/png" href={`${BASE}/icon.png`} />
        <link rel="apple-touch-icon" href={`${BASE}/icon.png`} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
