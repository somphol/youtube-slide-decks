/**
 * mutations.js — every write the viewer can perform, as one commit each.
 *
 * The repository is read fresh before each change. A change touches `deck.json`, the derived
 * catalog, and (when needed) a thumbnail blob, all in a single commit.
 */

import { readRepoFile, readRepoJson, commitChanges, jsonFile } from './github.js';
import { normalizeTags, tallyTags } from './tags.mjs';

export function videoIdFrom(input) {
  const s = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let url;
  try {
    url = new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const ok = (id) => (/^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null);
  if (host === 'youtu.be') return ok(url.pathname.split('/')[1]);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
    const v = url.searchParams.get('v');
    if (v) return ok(v);
    const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (match) return ok(match[1]);
  }
  return null;
}

async function loadDeckAndCatalog(token, deckId) {
  const [deckText, catalog] = await Promise.all([
    readRepoFile(`decks/${deckId}/deck.json`, token),
    readRepoJson('decks/index.json', token),
  ]);
  return { deck: JSON.parse(deckText), catalog };
}

function syncEntry(catalog, deck) {
  const entry = catalog.decks.find((d) => d.id === deck.id);
  if (!entry) return;
  const cover = deck.slides.find((s) => s.thumbnail) || deck.slides[0];
  entry.slideCount = deck.slides.length;
  entry.updatedAt = deck.updatedAt;
  entry.cover = cover ? cover.thumbnail || cover.thumbnailUrl || null : null;
  entry.coverVideoId = cover ? cover.videoId : null;
}

function adjustTagCounts(catalog, removed = [], added = []) {
  const counts = new Map((catalog.tags || []).map((t) => [t.name, t.count]));
  for (const tag of removed) counts.set(tag, (counts.get(tag) || 0) - 1);
  for (const tag of added) counts.set(tag, (counts.get(tag) || 0) + 1);
  catalog.tags = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function shortTitle(title) {
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
}

async function fetchMetadata(videoId) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`oEmbed ${res.status}`);
    const data = await res.json();
    return {
      title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : `YouTube video ${videoId}`,
      author: typeof data.author_name === 'string' ? data.author_name.trim() : '',
      authorUrl: typeof data.author_url === 'string' ? data.author_url : '',
    };
  } catch {
    return { title: `YouTube video ${videoId}`, author: '', authorUrl: '' };
  }
}

async function fetchThumbnail(videoId) {
  for (const quality of ['maxresdefault', 'sddefault', 'hqdefault']) {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${quality}.jpg`, { cache: 'force-cache' });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length < 9000) continue;
      return { bytes, quality };
    } catch {
      // try the next quality
    }
  }
  return null;
}

export async function addVideoToDeck({ token, deckId, url, note = '', tags = '' }) {
  const videoId = videoIdFrom(url);
  if (!videoId) throw new Error('That is not a YouTube link.');

  const [meta, thumb, { deck, catalog }] = await Promise.all([
    fetchMetadata(videoId),
    fetchThumbnail(videoId),
    loadDeckAndCatalog(token, deckId),
  ]);

  if (deck.slides.some((s) => s.videoId === videoId)) {
    const error = new Error('That video is already in this deck.');
    error.status = 409;
    throw error;
  }

  const now = new Date().toISOString();
  const slide = {
    id: videoId,
    type: 'video',
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: meta.title,
    author: meta.author,
    authorUrl: meta.authorUrl,
    durationSeconds: null,
    duration: null,
    thumbnail: thumb ? `thumbnails/${videoId}.jpg` : null,
    thumbnailUrl: thumb ? null : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    thumbnailQuality: thumb ? thumb.quality : null,
    tags: normalizeTags(tags),
    note: String(note || '').trim(),
    addedAt: now,
  };

  deck.slides.push(slide);
  deck.updatedAt = now;
  syncEntry(catalog, deck);
  adjustTagCounts(catalog, [], slide.tags);
  catalog.generatedAt = now;

  const files = [jsonFile(`decks/${deckId}/deck.json`, deck), jsonFile('decks/index.json', catalog)];
  if (thumb) files.push({ path: `decks/${deckId}/thumbnails/${videoId}.jpg`, bytes: thumb.bytes });

  const commit = await commitChanges({
    token,
    files,
    message: `Add "${shortTitle(slide.title)}" to ${deck.title}\n\nAdded from the deck viewer.`,
  });
  return { slide, deck, commitUrl: commit.url };
}

export async function deleteVideoFromDeck({ token, deckId, videoId }) {
  const { deck, catalog } = await loadDeckAndCatalog(token, deckId);
  const index = deck.slides.findIndex((s) => s.videoId === videoId);
  if (index < 0) throw new Error('That video is no longer in this deck.');

  const [slide] = deck.slides.splice(index, 1);
  deck.updatedAt = new Date().toISOString();
  syncEntry(catalog, deck);
  adjustTagCounts(catalog, slide.tags || [], []);
  catalog.generatedAt = deck.updatedAt;

  const deletes = slide.thumbnail ? [`decks/${deckId}/${slide.thumbnail}`] : [];
  const commit = await commitChanges({
    token,
    files: [jsonFile(`decks/${deckId}/deck.json`, deck), jsonFile('decks/index.json', catalog)],
    deletes,
    message: `Remove "${shortTitle(slide.title)}" from ${deck.title}\n\nRemoved from the deck viewer.`,
  });
  return { deck, slide, commitUrl: commit.url };
}

export async function setSlideTags({ token, deckId, videoId, tags }) {
  const { deck, catalog } = await loadDeckAndCatalog(token, deckId);
  const slide = deck.slides.find((s) => s.videoId === videoId);
  if (!slide) throw new Error('That video is no longer in this deck.');

  const before = normalizeTags(slide.tags || []);
  const after = normalizeTags(tags);
  if (before.join('\u0000') === after.join('\u0000')) {
    return { deck, slide, commitUrl: null, unchanged: true };
  }

  slide.tags = after;
  deck.updatedAt = new Date().toISOString();
  syncEntry(catalog, deck);
  adjustTagCounts(
    catalog,
    before.filter((t) => !after.includes(t)),
    after.filter((t) => !before.includes(t))
  );
  catalog.generatedAt = deck.updatedAt;

  const commit = await commitChanges({
    token,
    files: [jsonFile(`decks/${deckId}/deck.json`, deck), jsonFile('decks/index.json', catalog)],
    message: `Update tags for "${shortTitle(slide.title)}"\n\n${after.length ? after.map((t) => `#${t}`).join(' ') : 'No tags'}`,
  });
  return { deck, slide, commitUrl: commit.url };
}

async function loadAllDecks(token) {
  const catalog = await readRepoJson('decks/index.json', token);
  const decks = await Promise.all(
    catalog.decks.map(async (entry) => {
      const text = await readRepoFile(`decks/${entry.id}/deck.json`, token);
      return { entry, deck: JSON.parse(text) };
    })
  );
  return { catalog, decks };
}

async function rewriteTag({ token, from, to, mode }) {
  const { catalog, decks } = await loadAllDecks(token);
  const now = new Date().toISOString();
  const files = [];
  let affectedSlides = 0;
  let affectedDecks = 0;

  for (const { deck } of decks) {
    let changed = 0;
    for (const slide of deck.slides || []) {
      const tags = normalizeTags(slide.tags || []);
      if (!tags.includes(from)) continue;
      const next = tags.filter((t) => t !== from);
      if (mode === 'rename' && to) {
        const merged = normalizeTags([...next, to]);
        slide.tags = merged;
      } else {
        slide.tags = next;
      }
      changed++;
      affectedSlides++;
    }
    if (changed) {
      deck.updatedAt = now;
      affectedDecks++;
      syncEntry(catalog, deck);
      files.push(jsonFile(`decks/${deck.id}/deck.json`, deck));
    }
  }

  if (!affectedSlides) {
    const error = new Error(`#${from} is not used by any video.`);
    error.status = 404;
    throw error;
  }

  catalog.tags = tallyTags(decks.map((d) => d.deck));
  catalog.generatedAt = now;
  files.push(jsonFile('decks/index.json', catalog));

  const commit = await commitChanges({
    token,
    files,
    message:
      mode === 'rename'
        ? `Rename tag #${from} to #${to}\n\n${affectedSlides} video${affectedSlides === 1 ? '' : 's'} across ${affectedDecks} deck${affectedDecks === 1 ? '' : 's'}.`
        : `Remove tag #${from}\n\n${affectedSlides} video${affectedSlides === 1 ? '' : 's'} across ${affectedDecks} deck${affectedDecks === 1 ? '' : 's'}.`,
  });

  return { affectedSlides, affectedDecks, tags: catalog.tags, commitUrl: commit.url };
}

export async function renameTagEverywhere({ token, from, to }) {
  const target = normalizeTags(to)[0];
  if (!target) throw new Error('Enter a tag name.');
  if (target === from) return { unchanged: true };
  return rewriteTag({ token, from, to: target, mode: 'rename' });
}

export async function deleteTagEverywhere({ token, name }) {
  return rewriteTag({ token, from: name, to: null, mode: 'delete' });
}
