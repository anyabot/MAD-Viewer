import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Seo } from '@/components/seo';

export default function EventsRedirect() {
  const router = useRouter();
  useEffect(() => {
    void router.replace('/stages?mode=event');
  }, [router]);
  return <Seo noindex />;
}
