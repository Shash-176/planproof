import { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/harness/types';

export async function freshDb(): Promise<Db & { close: () => Promise<void> }> {
  return (await PGlite.create()) as unknown as Db & { close: () => Promise<void> };
}
