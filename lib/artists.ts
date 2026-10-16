export type ArtistLink = { site: string; url: string };

export const artistAnchor = (artist: string) => `artist-${encodeURIComponent(artist)}`;

// Keyed by the game's own `artist` column.
export const ARTIST_LINKS: Record<string, ArtistLink[]> = {
  SNOWBALL: [
    { site: 'pixiv', url: 'https://www.pixiv.net/users/97687' },
    { site: 'X', url: 'https://x.com/snowball020' },
  ],
  Sol: [
    { site: 'pixiv', url: 'https://www.pixiv.net/users/26511192' },
    { site: 'X', url: 'https://x.com/arnseo' },
    { site: 'Naver Blog', url: 'https://blog.naver.com/arnseo' },
  ],
  Cruno: [
    { site: 'X', url: 'https://x.com/Luvents3' },
  ],
  CHoney: [
    { site: 'pixiv', url: 'https://www.pixiv.net/users/1908283' },
    { site: 'X', url: 'https://x.com/choney1108' },
    { site: 'ArtStation', url: 'https://www.artstation.com/choney' },
    { site: 'Bluesky', url: 'https://bsky.app/profile/choney1108.bsky.social' },
  ],
  'うるる牡丹': [
    { site: 'pixiv', url: 'https://www.pixiv.net/users/77777190' },
    { site: 'X', url: 'https://x.com/ururubotan' },
    { site: 'FANBOX', url: 'https://ururubotan.fanbox.cc/' },
  ],
  Lumium: [
    { site: 'pixiv', url: 'https://www.pixiv.net/users/42833451' },
    { site: 'X', url: 'https://x.com/lovy_lovyyyyyy' },
    { site: 'FANBOX', url: 'https://lumium.fanbox.cc/' },
  ],
  MoRung: [
    { site: 'pixiv', url: 'https://www.pixiv.net/users/39842565' },
    { site: 'X', url: 'https://x.com/MoRung234' },
  ],
};
