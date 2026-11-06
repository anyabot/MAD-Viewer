import { describe, it, expect } from 'vitest';
import { buildViewerShareUrl, parseViewerShare } from '@/lib/viewerShare';

const STATE = {
  skin: 'ds_ch0010',
  store: 'google',
  context: 'desire_view',
  speed: 1.5,
  background: false,
  camera: 'free',
  aspect: '16:9',
  body: '10_basic/10_idle',
  face: '01_smile',
  stage: 'after',
} as const;

describe('viewer share links', () => {
  it('round-trip the viewer state and keep the route state', () => {
    const built = new URL(buildViewerShareUrl('https://example.test/character?code=CH0010&skin=old#view', STATE));
    expect(built.searchParams.get('code')).toBe('CH0010');
    expect(built.hash).toBe('#view');
    expect(parseViewerShare(built.search)).toEqual(STATE);
  });

  it('need a skin', () => {
    expect(parseViewerShare('?store=google')).toBeNull();
  });

  it('drop values outside their range', () => {
    expect(parseViewerShare('?skin=st_ch0001&store=other&speed=99&aspect=square')).toEqual({ skin: 'st_ch0001' });
  });
});
