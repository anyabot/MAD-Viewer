import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Seo } from '@/components/seo';
import { characterHref } from '@/lib/routes';

export default function CharacterRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const { code, ...rest } = router.query;
    const query = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    void router.replace(typeof code === 'string' ? characterHref(code, query) : '/characters');
  }, [router]);
  return <Seo noindex />;
}
