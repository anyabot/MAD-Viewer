import Head from 'next/head';
import { useRouter } from 'next/router';
import { getGame } from '@altterisk/game-hub';
import { clip, createSiteMeta, plainText as flatText, type SiteMeta } from '@altterisk/game-hub/meta';
import { tagElements } from '@altterisk/game-hub/meta/next';
import { LANGS, text, useLang, type Lang } from '@/lib/i18n';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? getGame('mad').url).replace(/\/$/, '');
const NOINDEX = process.env.NEXT_PUBLIC_NOINDEX === '1';

const SITES = Object.fromEntries(LANGS.map(({ value: lang }) => [lang, createSiteMeta({
  game: 'mad',
  url: SITE_URL,
  homeTitle: text(lang, 'seoHomeTitle'),
  defaultDescription: text(lang, 'seoDescHome'),
  defaultImage: '/icon.png',
  format: (title, site) => `${title} — ${text(lang, 'seoGameTitle')} | ${site.name}`,
})])) as Record<Lang, SiteMeta>;

// Canonical and share URLs name the main deploy whatever basePath this build serves under.
function withoutBase(path: string): string {
  return BASE && path.startsWith(BASE) ? path.slice(BASE.length) : path;
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
  const site = SITES[useLang()];
  const { asPath } = useRouter();
  const tags = site.headTags({
    title, description, image: image && withoutBase(image), noindex: noindex || NOINDEX, jsonLd,
  }, site.canonicalUrl(canonicalPath(asPath)));
  return <Head>{tagElements(tags)}</Head>;
}

export function breadcrumbs(items: { name: string; path: string }[]): object {
  return SITES.en.breadcrumbLd(items);
}

export function plainText(value: string | null | undefined, max = 160): string {
  return clip(flatText(value), max);
}
