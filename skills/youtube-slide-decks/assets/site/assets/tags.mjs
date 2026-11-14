/**
 * tags.mjs — tag normalisation and tallying, shared by the browser and the CLI.
 * Pure JavaScript: no DOM, no Node built-ins.
 */

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

export function normalizeTag(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LENGTH)
    .replace(/-+$/g, '');
}

export function normalizeTags(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(',');
  const out = [];
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (!tag || out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function tallyTags(decks) {
  const counts = new Map();
  for (const deck of decks) {
    for (const slide of deck.slides || []) {
      for (const tag of slide.tags || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}
