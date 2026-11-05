import { Html, Head, Main, NextScript } from 'next/document';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// optional, not swap: a late font must never re-wrap text that is already on screen.
const INTER_FACES = [
  ['inter-latin', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'],
  ['inter-latin-ext', 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF'],
].map(([file, range]) => `@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:optional;src:url(${BASE}/fonts/${file}.woff2) format("woff2");unicode-range:${range}}`).join('');

// A saved language or spoiler choice applies after hydration; hide the content until then instead of re-wrapping it.
const RESTORE_GATE = `(function(){try{var r=function(k){var v=localStorage.getItem(k);if(v==null)return null;try{v=JSON.parse(v)}catch(e){return v}return v&&typeof v==='object'&&'data' in v?v.data:v};var l=r('mad.lang'),g=r('mad.gameLang'),s=r('mad.spoilers');if(l==='ko'||(g&&g!=='auto'&&g!=='en')||s===true){var h=document.documentElement;h.setAttribute('data-restoring','');addEventListener('load',function(){setTimeout(function(){h.removeAttribute('data-restoring')},3000)})}}catch(e){}})()`;

export default function Document() {
  return (
    <Html lang="en" data-game="mad">
      <Head>
        <meta name="color-scheme" content="dark" />
        <link rel="icon" type="image/png" href={`${BASE}/icon.png`} />
        <link rel="apple-touch-icon" href={`${BASE}/icon.png`} />
        <link rel="preconnect" href="https://hub.altterisk.cc" />
        <link rel="preload" href={`${BASE}/fonts/inter-latin.woff2`} as="font" type="font/woff2" crossOrigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: `html{background:#0b0f17;color-scheme:dark}${INTER_FACES}html[data-restoring] .hub-shell__main{visibility:hidden}` }} />
        <script dangerouslySetInnerHTML={{ __html: RESTORE_GATE }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
