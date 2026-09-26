/**
 * Recherche de pays (Ctrl+K) : insensible à la casse, aux accents et à la ponctuation ; nom
 * français, nom anglais ou code. Les résultats les plus pertinents d'abord, puis les plus peuplés.
 */

export interface Searchable {
  index: number;
  id: string;
  nameFr: string;
  name: string;
  /** Départage des ex æquo (population). */
  weight: number;
}

/** Minuscules sans accents ni ponctuation, espaces simples. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`\-_.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreName(name: string, q: string): number {
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.split(' ').some((w) => w.startsWith(q))) return 60;
  if (name.includes(q)) return 40;
  return 0;
}

export function score(item: Searchable, query: string): number {
  const q = normalize(query);
  if (q === '') return 0;
  const byId = item.id.toLowerCase() === q ? 95 : 0;
  return Math.max(
    byId,
    scoreName(normalize(item.nameFr), q),
    scoreName(normalize(item.name), q) - 5,
  );
}

export function search<T extends Searchable>(items: readonly T[], query: string, limit = 12): T[] {
  if (normalize(query) === '') return [];
  return items
    .map((item) => ({ item, s: score(item, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || b.item.weight - a.item.weight)
    .slice(0, limit)
    .map((r) => r.item);
}
