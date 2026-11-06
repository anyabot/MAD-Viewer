import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';

export const DATA = path.resolve(process.cwd(), 'public/data');
export const ICONS = path.resolve(process.cwd(), 'public/icons');

export function read<T extends z.ZodType>(file: string, schema: T): z.infer<T> {
  const parsed = schema.safeParse(JSON.parse(readFileSync(path.join(DATA, file), 'utf8')));
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`${file} does not match its schema:\n${issues}`);
  }
  return parsed.data;
}

export const exists = (file: string) => existsSync(path.join(DATA, file));

export function jsonFiles(dir: string): string[] {
  const root = path.join(DATA, dir);
  const out: string[] = [];
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const full = path.join(at, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) out.push(path.relative(root, full).split(path.sep).join('/').replace(/\.json$/, ''));
    }
  };
  walk(root);
  return out;
}
