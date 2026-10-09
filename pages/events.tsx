import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function EventsRedirect() {
  const router = useRouter();
  useEffect(() => {
    void router.replace('/stages?mode=event');
  }, [router]);
  return null;
}
