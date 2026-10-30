type Query = Record<string, string | number | undefined>;

function withQuery(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== '') params.set(k, String(v));
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function characterHref(code: string, query?: Query): string {
  return withQuery(`/character/${encodeURIComponent(code)}/`, query);
}

export function eventHref(id: number | string, query?: Query): string {
  return withQuery(`/event/${id}/`, query);
}
