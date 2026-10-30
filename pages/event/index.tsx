import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Seo } from '@/components/seo';
import { eventHref } from '@/lib/routes';

export default function EventRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const { id } = router.query;
    void router.replace(typeof id === 'string' ? eventHref(id) : '/stages?mode=event');
  }, [router]);
  return <Seo noindex />;
}
