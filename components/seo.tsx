import Head from 'next/head';
import { useRouter } from 'next/router';
import { getGame } from '@altterisk/game-hub';
import { useT } from '@/lib/i18n';

const GAME = getGame('mad');
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? GAME.url).replace(/\/$/, '');
const NOINDEX = process.env.NEXT_PUBLIC_NOINDEX === '1';

// Canonical and share URLs name the main deploy whatever basePath this build serves under.
export function assetUrl(path: string): string {
  return `${SITE_URL}${BASE && path.startsWith(BASE) ? path.slice(BASE.length) : path}`;
}

function canonicalPath(asPath: string): string {
  const path = asPath.split(/[?#]/)[0];
  return path.endsWith('/') ? path : `${path}/`;
}

export type SeoProps = {
  title?: string;
  description?: string;
  image?: string | null;
  noindex?: boolean;
  jsonLd?: object;
};

export function Seo({ title, description, image, noindex, jsonLd }: SeoProps) {
  const t = useT();
  const { asPath } = useRouter();
  const url = `${SITE_URL}${canonicalPath(asPath)}`;
  const full = title ? `${title} — ${t('seoGameTitle')} | ${GAME.name}` : t('seoHomeTitle');
  const desc = description ?? t('seoDescHome');
  const img = assetUrl(image ?? `${BASE}/icon.png`);
  return (
    <Head>
      <title>{full}</title>
      <meta key="description" name="description" content={desc} />
      <link key="canonical" rel="canonical" href={url} />
      {(noindex || NOINDEX) && <meta key="robots" name="robots" content="noindex" />}
      <meta key="og:site_name" property="og:site_name" content={GAME.name} />
      <meta key="og:type" property="og:type" content="website" />
      <meta key="og:title" property="og:title" content={full} />
      <meta key="og:description" property="og:description" content={desc} />
      <meta key="og:url" property="og:url" content={url} />
      <meta key="og:image" property="og:image" content={img} />
      <meta key="twitter:card" name="twitter:card" content="summary" />
      {jsonLd && (
        <script key="ld-json" type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      )}
    </Head>
  );
}

export function breadcrumbs(items: { name: string; path: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem', position: i + 1, name: item.name, item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function plainText(text: string | null | undefined, max = 160): string {
  const flat = (text ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
