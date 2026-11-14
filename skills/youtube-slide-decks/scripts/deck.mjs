#!/usr/bin/env node
/**
 * deck.mjs — zero-dependency CLI for a collection of YouTube video slide decks.
 *
 * A collection is a directory with:
 *   decks/index.json              generated catalog
 *   decks/<deck-id>/deck.json     deck metadata + slides
 *   decks/<deck-id>/thumbnails/   downloaded thumbnails
 *   index.html, deck.html, assets/ static viewer (GitHub Pages ready)
 *
 * Usage: node deck.mjs <command> [args] [--home DIR]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { buildPptx } from './pptx.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(SCRIPT_DIR, '..', 'assets', 'site');
const DEFAULT_HOME = path.join(os.homedir(), 'Projects', 'youtube-slide-decks');
const SITE_FILES = ['index.html', 'deck.html', '.nojekyll'];
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------------------------------------------------------------- utilities

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  } else {
    positional.push(a);
  }
}

const [command, ...rest] = positional;

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function slugify(input) {
  const s = String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'deck';
}

const DECK_SUFFIX = /\s+(slide\s*deck|slide\s*decks|slides|deck)$/i;

function cleanTitle(input) {
  let t = String(input).trim().replace(/\s+/g, ' ');
  while (DECK_SUFFIX.test(t)) t = t.replace(DECK_SUFFIX, '');
  return t.trim() || String(input).trim();
}

function norm(input) {
  return cleanTitle(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function iso() {
  return new Date().toISOString();
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- home

async function looksLikeCollection(dir) {
  return pathExists(path.join(dir, 'decks'));
}

async function resolveHome() {
  if (flags.home) return path.resolve(String(flags.home));
  if (process.env.DECK_HOME) return path.resolve(process.env.DECK_HOME);
  if (await looksLikeCollection(process.cwd())) return process.cwd();
  if (await looksLikeCollection(DEFAULT_HOME)) return DEFAULT_HOME;
  return null;
}

async function requireHome() {
  const home = await resolveHome();
  if (!home) {
    fail(
      'no slide-deck collection found. Create one with:\n' +
        `  node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))} init --home ~/Projects/youtube-slide-decks`
    );
  }
  if (!(await pathExists(path.join(home, 'decks', 'index.json')))) {
    fail(`${home} has a decks/ folder but no decks/index.json. Run: node deck.mjs rebuild --home ${home}`);
  }
  return home;
}

// ---------------------------------------------------------------- deck storage

async function loadDeck(home, id) {
  const file = path.join(home, 'decks', id, 'deck.json');
  if (!(await pathExists(file))) return null;
  return readJson(file);
}

async function loadDecks(home) {
  const dir = path.join(home, 'decks');
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const decks = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const deck = await loadDeck(home, entry.name).catch(() => null);
    if (deck) decks.push(deck);
  }
  return decks;
}

function resolveDeck(decks, query) {
  const q = norm(query);
  if (!q) return { error: 'empty deck name' };
  const exactSlug = decks.filter((d) => d.id === String(query).trim());
  if (exactSlug.length === 1) return { deck: exactSlug[0] };
  const exactTitle = decks.filter((d) => norm(d.title) === q);
  if (exactTitle.length === 1) return { deck: exactTitle[0] };
  const contains = decks.filter((d) => norm(d.title).includes(q) || q.includes(norm(d.title)));
  if (contains.length === 1) return { deck: contains[0] };
  const prefix = decks.filter((d) => norm(d.title).startsWith(q));
  if (prefix.length === 1) return { deck: prefix[0] };
  const pool = contains.length > 1 ? contains : prefix.length > 1 ? prefix : decks;
  return {
    error: `no unique deck matching "${query}"`,
    candidates: pool.map((d) => `${d.id}  (${d.title})`),
  };
}

async function saveDeck(home, deck) {
  deck.updatedAt = iso();
  await writeJson(path.join(home, 'decks', deck.id, 'deck.json'), deck);
  await rebuildIndex(home);
}

async function uniqueDeckId(home, base) {
  let id = base;
  let n = 2;
  while (await pathExists(path.join(home, 'decks', id))) {
    id = `${base.slice(0, 55)}-${n++}`;
  }
  return id;
}

// ---------------------------------------------------------------- youtube

function videoIdFrom(input) {
  const s = String(input).trim();
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
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return ok(m[1]);
  }
  return null;
}

async function fetchJson(url, timeout = 15000) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchOEmbed(videoId) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  try {
    const data = await fetchJson(url);
    return {
      title: typeof data.title === 'string' ? data.title.trim() : '',
      author: typeof data.author_name === 'string' ? data.author_name.trim() : '',
      authorUrl: typeof data.author_url === 'string' ? data.author_url : '',
    };
  } catch {
    return { title: '', author: '', authorUrl: '' };
  }
}

async function fetchDuration(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

const THUMB_QUALITIES = ['maxresdefault', 'sddefault', 'hqdefault'];

async function downloadThumbnail(videoId, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  for (const quality of THUMB_QUALITIES) {
    const url = `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'image/jpeg,image/*' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // YouTube serves a small grey placeholder for missing maxres/sd images.
      if (buf.length < 9000) continue;
      const file = path.join(destDir, `${videoId}.jpg`);
      await fs.writeFile(`${file}.tmp`, buf);
      await fs.rename(`${file}.tmp`, file);
      return { quality, bytes: buf.length };
    } catch {
      // try next quality
    }
  }
  return null;
}

async function buildSlide(videoId, deckDir, options) {
  const [meta, duration] = await Promise.all([fetchOEmbed(videoId), fetchDuration(videoId)]);
  const thumbDir = path.join(deckDir, 'thumbnails');
  const downloaded = options.hotlink ? null : await downloadThumbnail(videoId, thumbDir);
  const remote = `https://i.ytimg.com/vi/${videoId}/${downloaded ? 'maxresdefault' : 'hqdefault'}.jpg`;
  return {
    id: videoId,
    type: 'video',
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: meta.title || `YouTube video ${videoId}`,
    author: meta.author || '',
    authorUrl: meta.authorUrl || '',
    durationSeconds: duration,
    duration: formatDuration(duration),
    thumbnail: downloaded ? `thumbnails/${videoId}.jpg` : null,
    thumbnailUrl: downloaded ? null : remote,
    thumbnailQuality: downloaded ? downloaded.quality : null,
    note: options.note || '',
    addedAt: iso(),
  };
}

// ---------------------------------------------------------------- index / scaffold

async function rebuildIndex(home) {
  const decks = await loadDecks(home);
  decks.sort((a, b) => a.title.localeCompare(b.title));
  const index = {
    generatedAt: iso(),
    decks: [],
  };
  for (const d of decks) {
    const cover = d.slides.find((s) => s.thumbnail) || d.slides[0];
    const pptxRel = `exports/${d.id}.pptx`;
    const hasPptx = await pathExists(path.join(home, pptxRel));
    index.decks.push({
      id: d.id,
      title: d.title,
      description: d.description || '',
      slideCount: d.slides.length,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      cover: cover ? cover.thumbnail || cover.thumbnailUrl || null : null,
      coverVideoId: cover ? cover.videoId : null,
      pptx: hasPptx ? pptxRel : null,
    });
  }
  await writeJson(path.join(home, 'decks', 'index.json'), index);
  return index;
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(src, dest);
    else if (entry.isFile()) await fs.copyFile(src, dest);
  }
}

async function initCollection(home) {
  await fs.mkdir(path.join(home, 'decks'), { recursive: true });
  if (await pathExists(TEMPLATE_DIR)) {
    await copyDir(TEMPLATE_DIR, home);
  } else {
    console.warn(`warning: site template not found at ${TEMPLATE_DIR}; decks will be created without a viewer`);
  }
  const readme = path.join(home, 'README.md');
  if (!(await pathExists(readme))) {
    await fs.writeFile(
      readme,
      '# YouTube Slide Decks\n\nA collection of YouTube videos as slide decks.\n\n' +
        '```sh\nnode scripts/deck.mjs list\nnode scripts/deck.mjs add "Deck name" "https://youtu.be/VIDEO_ID"\nnode scripts/deck.mjs serve\n```\n\n' +
        'Published with GitHub Pages from the repository root.\n',
      'utf8'
    );
  }
  const pkg = path.join(home, 'package.json');
  if (!(await pathExists(pkg))) {
    await writeJson(pkg, {
      name: path.basename(home),
      private: true,
      type: 'module',
      scripts: {
        list: 'node scripts/deck.mjs list',
        add: 'node scripts/deck.mjs add',
        export: 'node scripts/deck.mjs export --all',
        serve: 'node scripts/deck.mjs serve',
        verify: 'node scripts/deck.mjs verify',
      },
    });
  }
  const gitignore = path.join(home, '.gitignore');
  if (!(await pathExists(gitignore))) {
    await fs.writeFile(gitignore, '.DS_Store\nexports/\nnode_modules/\n', 'utf8');
  }
  await rebuildIndex(home);
  return home;
}

// ---------------------------------------------------------------- commands

async function cmdInit() {
  const home = path.resolve(String(flags.home || process.env.DECK_HOME || DEFAULT_HOME));
  await initCollection(home);
  console.log(`initialised collection at ${home}`);
  console.log(`next: node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))} list --home ${home}`);
}

async function cmdList() {
  const home = await requireHome();
  const index = await rebuildIndex(home);
  if (flags.json) {
    console.log(JSON.stringify(index, null, 2));
    return;
  }
  if (!index.decks.length) {
    console.log(`no decks in ${home}. Create one with: node deck.mjs create "Deck name"`);
    return;
  }
  console.log(`${index.decks.length} deck${index.decks.length === 1 ? '' : 's'} in ${home}\n`);
  for (const d of index.decks) {
    const updated = (d.updatedAt || d.createdAt || '').slice(0, 10);
    console.log(`  ${d.id}`);
    console.log(`    ${d.title} — ${d.slideCount} slide${d.slideCount === 1 ? '' : 's'}, updated ${updated}`);
  }
}

async function cmdCreate() {
  const home = await requireHome();
  const rawTitle = rest.join(' ').trim();
  if (!rawTitle) fail('usage: deck.mjs create "Deck title" [--description "..."]');
  const title = cleanTitle(rawTitle);
  const base = slugify(title);
  const decks = await loadDecks(home);
  const existing = decks.find((d) => norm(d.title) === norm(title));
  if (existing) {
    console.log(`deck already exists: ${existing.id}  (${existing.title})`);
    return;
  }
  const id = flags.id ? slugify(String(flags.id)) : await uniqueDeckId(home, base);
  const now = iso();
  const deck = {
    id,
    title,
    description: flags.description ? String(flags.description) : '',
    createdAt: now,
    updatedAt: now,
    slides: [],
  };
  await fs.mkdir(path.join(home, 'decks', id, 'thumbnails'), { recursive: true });
  await writeJson(path.join(home, 'decks', id, 'deck.json'), deck);
  await rebuildIndex(home);
  console.log(`created deck: ${id}  (${title})`);
}

async function cmdAdd() {
  const home = await requireHome();
  const deckQuery = rest[0];
  const inputs = rest.slice(1);
  if (!deckQuery) fail('usage: deck.mjs add "Deck name" <youtube-url> [more urls] [--note "..."] [--create]');
  if (!inputs.length) fail('no YouTube URL given');

  const decks = await loadDecks(home);
  let deck;
  const found = resolveDeck(decks, deckQuery);
  if (found.deck) {
    deck = found.deck;
  } else if (flags.create) {
    await cmdCreateFor(home, deckQuery);
    deck = (await loadDecks(home)).find((d) => norm(d.title) === norm(cleanTitle(deckQuery)));
    if (!deck) fail(`could not create deck "${deckQuery}"`);
  } else {
    console.error(`error: ${found.error}`);
    if (found.candidates?.length) {
      console.error('candidates:');
      for (const c of found.candidates) console.error(`  ${c}`);
    }
    console.error(`create it first: node deck.mjs create "${cleanTitle(deckQuery)}"`);
    process.exit(2);
  }

  const deckDir = path.join(home, 'decks', deck.id);
  const results = [];
  for (const input of inputs) {
    const videoId = videoIdFrom(input);
    if (!videoId) {
      results.push({ input, status: 'error', message: 'not a YouTube video URL or ID' });
      continue;
    }
    const existing = deck.slides.find((s) => s.videoId === videoId);
    if (existing && !flags.force) {
      results.push({ input, status: 'skipped', message: `already in deck: ${existing.title}`, videoId });
      continue;
    }
    process.stderr.write(`fetching ${videoId} … `);
    const slide = await buildSlide(videoId, deckDir, {
      note: typeof flags.note === 'string' ? flags.note : '',
      hotlink: Boolean(flags.hotlink),
    });
    process.stderr.write(`${slide.title}\n`);
    if (existing) Object.assign(existing, slide);
    else deck.slides.push(slide);
    results.push({
      input,
      status: existing ? 'refreshed' : 'added',
      videoId,
      title: slide.title,
      author: slide.author,
      duration: slide.duration,
      thumbnail: slide.thumbnail,
      warning: slide.thumbnail ? undefined : 'thumbnail download failed; using remote image',
    });
    await writeJson(path.join(deckDir, 'deck.json'), { ...deck, updatedAt: iso() });
  }
  deck.updatedAt = iso();
  await writeJson(path.join(deckDir, 'deck.json'), deck);
  await rebuildIndex(home);

  if (flags.json) {
    console.log(JSON.stringify({ deck: { id: deck.id, title: deck.title }, results }, null, 2));
    return;
  }
  for (const r of results) {
    const label = r.status === 'added' ? 'added  ' : r.status === 'refreshed' ? 'updated' : r.status === 'skipped' ? 'skipped' : 'ERROR  ';
    console.log(`${label} ${r.title || r.videoId || r.input}${r.message ? ` — ${r.message}` : ''}`);
  }
  console.log(`\n${deck.title}: ${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'}`);
  const failed = results.some((r) => r.status === 'error');
  if (failed) process.exitCode = 1;
}

async function cmdCreateFor(home, query) {
  const title = cleanTitle(query);
  const id = await uniqueDeckId(home, slugify(title));
  const now = iso();
  await fs.mkdir(path.join(home, 'decks', id, 'thumbnails'), { recursive: true });
  await writeJson(path.join(home, 'decks', id, 'deck.json'), {
    id,
    title,
    description: '',
    createdAt: now,
    updatedAt: now,
    slides: [],
  });
  await rebuildIndex(home);
  console.log(`created deck: ${id}  (${title})`);
  return id;
}

async function deckFromQuery(home, query) {
  const decks = await loadDecks(home);
  const found = resolveDeck(decks, query);
  if (!found.deck) {
    console.error(`error: ${found.error}`);
    for (const c of found.candidates || []) console.error(`  ${c}`);
    process.exit(2);
  }
  return found.deck;
}

async function cmdRemove() {
  const home = await requireHome();
  const [deckQuery, target] = rest;
  if (!deckQuery || !target) fail('usage: deck.mjs remove "Deck name" <video-id|url|index>');
  const deck = await deckFromQuery(home, deckQuery);
  const deckDir = path.join(home, 'decks', deck.id);
  const videoId = videoIdFrom(target);
  let idx = -1;
  if (videoId) idx = deck.slides.findIndex((s) => s.videoId === videoId);
  if (idx < 0 && /^\d+$/.test(target)) idx = Number(target) - 1;
  if (idx < 0 || idx >= deck.slides.length) fail(`"${target}" is not a slide in ${deck.id}`);
  const [removed] = deck.slides.splice(idx, 1);
  if (removed.thumbnail) {
    await fs.rm(path.join(deckDir, removed.thumbnail), { force: true }).catch(() => {});
  }
  await saveDeck(home, deck);
  console.log(`removed from ${deck.title}: ${removed.title} (${removed.videoId})`);
}

async function cmdMove() {
  const home = await requireHome();
  const [deckQuery, target, position] = rest;
  if (!deckQuery || !target || !position) fail('usage: deck.mjs move "Deck name" <video-id|index> <new-index>');
  const deck = await deckFromQuery(home, deckQuery);
  const videoId = videoIdFrom(target);
  let from = videoId ? deck.slides.findIndex((s) => s.videoId === videoId) : Number(target) - 1;
  if (from < 0 || from >= deck.slides.length) fail(`"${target}" is not a slide in ${deck.id}`);
  const to = Math.max(0, Math.min(deck.slides.length - 1, Number(position) - 1));
  const [slide] = deck.slides.splice(from, 1);
  deck.slides.splice(to, 0, slide);
  await saveDeck(home, deck);
  console.log(`moved "${slide.title}" to position ${to + 1} in ${deck.title}`);
}

async function cmdRename() {
  const home = await requireHome();
  const deckQuery = rest[0];
  const newTitle = cleanTitle(rest.slice(1).join(' '));
  if (!deckQuery || !newTitle) fail('usage: deck.mjs rename "Deck name" "New title"');
  const deck = await deckFromQuery(home, deckQuery);
  deck.title = newTitle;
  const dir = path.join(home, 'decks', deck.id);
  const desiredId = slugify(newTitle);
  if (desiredId !== deck.id && !(await pathExists(path.join(home, 'decks', desiredId)))) {
    await fs.rename(dir, path.join(home, 'decks', desiredId));
    deck.id = desiredId;
  }
  await writeJson(path.join(home, 'decks', deck.id, 'deck.json'), { ...deck, updatedAt: iso() });
  await rebuildIndex(home);
  console.log(`renamed to ${deck.id}  (${deck.title})`);
}

async function cmdDelete() {
  const home = await requireHome();
  const deckQuery = rest[0];
  if (!deckQuery) fail('usage: deck.mjs delete "Deck name" --yes');
  const deck = await deckFromQuery(home, deckQuery);
  if (!flags.yes) fail(`refusing to delete ${deck.id} (${deck.slides.length} slides) without --yes`);
  await fs.rm(path.join(home, 'decks', deck.id), { recursive: true, force: true });
  await rebuildIndex(home);
  console.log(`deleted deck: ${deck.id}`);
}

async function cmdRebuild() {
  const home = await requireHome();
  const index = await rebuildIndex(home);
  console.log(`rebuilt decks/index.json (${index.decks.length} deck${index.decks.length === 1 ? '' : 's'})`);
}

async function cmdExport() {
  const home = await requireHome();
  const decks = await loadDecks(home);
  if (!decks.length) fail('no decks to export');

  const wantsAll = Boolean(flags.all) || !rest[0];
  let targets = decks;
  if (!wantsAll) {
    const found = resolveDeck(decks, rest[0]);
    if (!found.deck) {
      console.error(`error: ${found.error}`);
      for (const c of found.candidates || []) console.error(`  ${c}`);
      process.exit(2);
    }
    targets = [found.deck];
  }

  const outDir = path.resolve(String(flags.out || path.join(home, 'exports')));
  await fs.mkdir(outDir, { recursive: true });
  const written = [];

  for (const deck of targets) {
    if (!deck.slides.length) {
      console.log(`skip ${deck.id}: no slides`);
      continue;
    }
    process.stderr.write(`exporting ${deck.id} (${deck.slides.length} slides) … `);
    const buffer = await buildPptx(deck, path.join(home, 'decks', deck.id));
    const file = path.join(outDir, `${deck.id}.pptx`);
    await fs.writeFile(`${file}.tmp`, buffer);
    await fs.rename(`${file}.tmp`, file);
    const mb = (buffer.length / 1048576).toFixed(2);
    process.stderr.write(`${mb} MB\n`);
    written.push({ deck: deck.id, file, bytes: buffer.length });
  }

  await rebuildIndex(home);

  if (flags.json) {
    console.log(JSON.stringify({ outDir, written }, null, 2));
    return;
  }
  for (const item of written) console.log(`${item.deck}.pptx  ${path.relative(process.cwd(), item.file)}`);
  if (!written.length) return;
  console.log(
    '\nImport into Google Slides: Drive → New → File upload → open the .pptx with Google Slides,' +
      ' or in an existing deck File → Import slides.'
  );
  if (outDir === path.join(home, 'exports')) {
    console.log('exports/ is gitignored: the .pptx files stay local, the deck data is versioned.');
  }
}

async function cmdVerify() {
  const home = await requireHome();
  const problems = [];
  const warnings = [];
  const ok = (msg) => console.log(`  PASS  ${msg}`);
  const bad = (msg) => {
    problems.push(msg);
    console.log(`  FAIL  ${msg}`);
  };
  const warn = (msg) => {
    warnings.push(msg);
    console.log(`  WARN  ${msg}`);
  };

  console.log(`verifying ${home}\n`);

  for (const file of SITE_FILES) {
    (await pathExists(path.join(home, file))) ? ok(`site file ${file}`) : bad(`missing site file ${file}`);
  }
  for (const file of ['assets/app.js', 'assets/styles.css']) {
    (await pathExists(path.join(home, file))) ? ok(`site asset ${file}`) : bad(`missing site asset ${file}`);
  }

  const idxFile = path.join(home, 'decks', 'index.json');
  let index = null;
  if (!(await pathExists(idxFile))) {
    bad('decks/index.json missing');
  } else {
    try {
      index = await readJson(idxFile);
      ok('decks/index.json is valid JSON');
    } catch (e) {
      bad(`decks/index.json is not valid JSON: ${e.message}`);
    }
  }

  const decks = await loadDecks(home);
  const ids = new Set();
  for (const deck of decks) {
    if (ids.has(deck.id)) bad(`duplicate deck id ${deck.id}`);
    ids.add(deck.id);
    if (deck.id !== path.basename(path.dirname(path.join(home, 'decks', deck.id, 'deck.json')))) {
      // id/directory mismatch is detected below via explicit comparison
    }
    const dir = path.join(home, 'decks', deck.id);
    if (deck.id !== path.basename(dir)) bad(`deck id "${deck.id}" does not match directory "${path.basename(dir)}"`);
    if (!deck.title) bad(`${deck.id}: missing title`);
    if (!Array.isArray(deck.slides)) {
      bad(`${deck.id}: slides is not an array`);
      continue;
    }
    if (!deck.slides.length) warn(`${deck.id}: no slides yet`);
    const seen = new Set();
    for (const [i, slide] of deck.slides.entries()) {
      const where = `${deck.id}[${i + 1}]`;
      if (!slide.videoId || !/^[A-Za-z0-9_-]{11}$/.test(slide.videoId)) bad(`${where}: bad videoId`);
      if (!slide.url || !slide.url.includes(slide.videoId)) bad(`${where}: url does not contain videoId`);
      if (seen.has(slide.videoId)) bad(`${where}: duplicate video ${slide.videoId}`);
      seen.add(slide.videoId);
      if (slide.thumbnail) {
        const t = path.join(dir, slide.thumbnail);
        if (!(await pathExists(t))) bad(`${where}: missing thumbnail ${slide.thumbnail}`);
        else {
          const st = await fs.stat(t);
          if (st.size < 9000) bad(`${where}: thumbnail suspiciously small (${st.size} bytes)`);
        }
      } else if (slide.thumbnailUrl) {
        warn(`${where}: remote thumbnail only (${slide.thumbnailUrl})`);
      } else {
        bad(`${where}: no thumbnail and no thumbnailUrl`);
      }
      if (!slide.title) warn(`${where}: empty title`);
    }
    ok(`${deck.id}: ${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'}`);
  }

  if (index) {
    const expected = {
      decks: decks
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((d) => d.id),
    };
    const actual = index.decks.map((d) => d.id);
    if (JSON.stringify(expected.decks) !== JSON.stringify(actual)) {
      bad('decks/index.json is out of sync with deck folders (run: node deck.mjs rebuild)');
    } else {
      ok('catalog matches deck folders');
    }
    for (const entry of index.decks) {
      const deck = decks.find((d) => d.id === entry.id);
      if (!deck) continue;
      if (entry.slideCount !== deck.slides.length) bad(`catalog: ${entry.id} slideCount is stale`);
      if (entry.cover) {
        const coverPath = entry.cover.startsWith('http') ? null : path.join(home, 'decks', entry.id, entry.cover);
        if (coverPath && !(await pathExists(coverPath))) bad(`catalog: cover missing for ${entry.id}`);
      }
      if (entry.pptx) {
        const pptxPath = path.join(home, entry.pptx);
        if (!(await pathExists(pptxPath))) {
          warn(`catalog: ${entry.pptx} is not built yet (run: node deck.mjs export)`);
        }
      }
    }
  }

  const exportsDir = path.join(home, 'exports');
  if (await pathExists(exportsDir)) {
    for (const file of (await fs.readdir(exportsDir)).filter((f) => f.endsWith('.pptx'))) {
      const full = path.join(exportsDir, file);
      const stat = await fs.stat(full);
      const handle = await fs.open(full, 'r');
      const signature = Buffer.alloc(2);
      await handle.read(signature, 0, 2, 0);
      await handle.close();
      if (signature.toString() !== 'PK') bad(`exports/${file} is not a valid PowerPoint container`);
      else if (stat.size < 10000) bad(`exports/${file} is suspiciously small (${stat.size} bytes)`);
      else ok(`export exports/${file} (${(stat.size / 1048576).toFixed(2)} MB)`);
    }
  }

  if (flags.remote) {
    for (const deck of decks) {
      for (const slide of deck.slides) {
        const url = slide.thumbnail
          ? `https://i.ytimg.com/vi/${slide.videoId}/hqdefault.jpg`
          : slide.thumbnailUrl;
        try {
          const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
          if (!res.ok) bad(`remote thumbnail HTTP ${res.status}: ${url}`);
        } catch (e) {
          bad(`remote thumbnail unreachable: ${url} (${e.message})`);
        }
      }
    }
    ok('remote thumbnails checked');
  }

  console.log(`\n${problems.length ? `${problems.length} problem(s)` : 'no problems'}, ${warnings.length} warning(s)`);
  if (problems.length) process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function cmdServe() {
  const home = await requireHome();
  const port = Number(flags.port || process.env.PORT || 4173);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.join(home, rel);
      if (!file.startsWith(home)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      let stat = await fs.stat(file).catch(() => null);
      if (stat?.isDirectory()) {
        stat = await fs.stat(path.join(file, 'index.html')).catch(() => null);
      }
      if (!stat) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(await fs.readFile(file));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end(String(e.message));
    }
  });
  server.listen(port, () => {
    console.log(`serving ${home}`);
    console.log(`  http://localhost:${port}/`);
  });
}

function usage() {
  console.log(`YouTube slide decks — zero-dependency collection manager

  init [--home DIR]                     create a collection
  list [--json]                         list decks
  create "Title" [--description "..."]  create an empty deck
  add "Deck" <url...> [--create] [--note "..."] [--force] [--hotlink]
                                        add videos (downloads thumbnails)
  remove "Deck" <video-id|url|index>    remove a slide
  move "Deck" <video-id|index> <pos>    reorder a slide
  rename "Deck" "New title"             rename a deck
  delete "Deck" --yes                   delete a deck
  export ["Deck" | --all] [--out DIR]   write .pptx files for Google Slides
  rebuild                               regenerate decks/index.json
  verify [--remote]                     validate collection and thumbnails
  serve [--port 4173]                   preview the site locally

Global: --home DIR, or DECK_HOME, or the current directory.
`);
}

const commands = {
  init: cmdInit,
  list: cmdList,
  create: cmdCreate,
  add: cmdAdd,
  remove: cmdRemove,
  move: cmdMove,
  rename: cmdRename,
  delete: cmdDelete,
  export: cmdExport,
  rebuild: cmdRebuild,
  verify: cmdVerify,
  serve: cmdServe,
};

const handler = commands[command];
if (!handler) {
  usage();
  if (command) process.exit(command === 'help' || command === '--help' ? 0 : 1);
} else {
  handler().catch((e) => fail(e.stack || e.message));
}
