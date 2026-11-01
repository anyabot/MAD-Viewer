import { readFileSync } from 'fs';
import path from 'path';

// Build time only: the deployed data files as they sit in the repo; dev:local points at data-full.
export function readData<T>(name: string): T {
  const base = (process.env.NEXT_PUBLIC_DATA_BASE ?? '').replace(/^\/+/, '') || 'data';
  return JSON.parse(readFileSync(path.join(process.cwd(), 'public', base, name), 'utf-8')) as T;
}
