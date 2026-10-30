import { readFileSync } from 'fs';
import path from 'path';

// Build time only: the deployed data files as they sit in the repo.
export function readData<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'data', name), 'utf-8')) as T;
}
