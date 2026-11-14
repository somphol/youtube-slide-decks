/* YouTube Slide Decks — static viewer. No dependencies, no tracking. */

import { buildPptx } from './pptx-core.mjs';
import { setupConnect } from './connect.js';
import { setupAddVideo } from './add.js';
import { setupDialogs } from './dialogs.js';
import { deleteVideoFromDeck, setSlideTags } from './mutations.js';
import { getToken, friendlyError } from './github.js';
import { normalizeTag } from './tags.mjs';

const DATA_ROOT = 'decks/';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const $ = (selector, root = document) => root.querySelector(selector);

const state = {
  deck: null,
  slides: [],
  index: 0,
  gridOpen: false,
  suppressClick: false,
  virtual: false,
  tag: '',
  mounted: false,
};

const connect = setupConnect();
const dialogs = setupDialogs();

const addDialog = setupAddVideo({
  ensureToken: connect.ensureToken,
  getDeck: () => state.deck,
  onAdded: (slide, updatedDeck) => {
    if (!updatedDeck) return;
    state.deck = updatedDeck;
    state.slides = updatedDeck.slides;
    refreshDeckUi();
    renderSlide(state.slides.length - 1);
    toast('Video added. The public site updates in about a minute.', 'success');
  },
});

/* ------------------------------------------------------------------ helpers */

async function loadIndex() {
  const res = await fetch(`${DATA_ROOT}index.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Catalog not found (HTTP ${res.status}).`);
  const data = await res.json();
  if (!Array.isArray(data.decks)) throw new Error('Catalog is malformed.');
  return data;
}

async function loadDeck(id) {
  const res = await fetch(`${DATA_ROOT}${encodeURIComponent(id)}/deck.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Deck "${id}" not found (HTTP ${res.status}).`);
  const deck = await res.json();
  deck.slides = Array.isArray(deck.slides) ? deck.slides : [];
  return deck;
}

function slideImage(deckId, slide) {
  const root = slide._deckId ? `${DATA_ROOT}${encodeURIComponent(slide._deckId)}` : `${DATA_ROOT}${encodeURIComponent(deckId)}`;
  if (slide.thumbnail) return `${root}/${slide.thumbnail}`;
  return slide.thumbnailUrl || `https://i.ytimg.com/vi/${slide.videoId}/hqdefault.jpg`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

const PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1b2229"/><stop offset="1" stop-color="#0e1216"/>
      </linearGradient></defs>
      <rect width="640" height="360" fill="url(#g)"/>
      <circle cx="320" cy="180" r="34" fill="#ff3d3d"/>
      <path d="M310 165l24 15-24 15z" fill="#fff"/>
      <text x="320" y="252" fill="#97a3b2" font-family="Arial, sans-serif" font-size="14" text-anchor="middle">thumbnail unavailable</text>
    </svg>`
  );

function guardImage(img) {
  img.addEventListener(
    'error',
    () => {
      img.src = PLACEHOLDER;
    },
    { once: true }
  );
}

function showError(message, target) {
  target.hidden = false;
  target.textContent =
    location.protocol === 'file:'
      ? 'Open this site through a local server: run `node scripts/deck.mjs serve` and visit http://localhost:4173/.'
      : String(message.message || message);
}

function toast(message, kind = 'info') {
  let node = document.getElementById('toast');
  if (!node) {
    node = el('div', { id: 'toast', class: 'toast', role: 'status' });
    document.body.append(node);
  }
  node.textContent = message;
  node.dataset.kind = kind;
  node.classList.add('show');
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove('show'), 4200);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* ------------------------------------------------------------------ index page */

function deckCard(entry) {
  const cover = el('div', { class: 'deck-cover' });
  if (entry.cover) {
    const img = el('img', {
      src: entry.cover.startsWith('http') ? entry.cover : `${DATA_ROOT}${entry.id}/${entry.cover}`,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
    });
    guardImage(img);
    cover.append(img);
  }
  cover.append(el('span', { class: 'play', 'aria-hidden': 'true' }));

  const body = el(
    'div',
    { class: 'deck-body' },
    el('h2', {}, entry.title),
    el(
      'p',
      {},
      `${entry.slideCount} video${entry.slideCount === 1 ? '' : 's'}${entry.updatedAt ? ` · updated ${formatDate(entry.updatedAt)}` : ''}`
    ),
    entry.description ? el('p', { class: 'deck-desc' }, entry.description) : null
  );

  return el('a', { class: 'deck-card', href: `deck.html?deck=${encodeURIComponent(entry.id)}` }, cover, body);
}

async function bootIndex() {
  const grid = $('#deck-grid');
  const empty = $('#empty');
  const error = $('#error');
  const stats = $('#stats');

  try {
    const index = await loadIndex();
    if (!index.decks.length) {
      empty.hidden = false;
      return;
    }
    const videos = index.decks.reduce((sum, d) => sum + (d.slideCount || 0), 0);
    stats.append(
      el('span', {}, `${index.decks.length} deck${index.decks.length === 1 ? '' : 's'}`),
      el('span', {}, `${videos} video${videos === 1 ? '' : 's'}`)
    );

    const cards = index.decks.map(deckCard);
    grid.append(...cards);

    const search = $('#search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      cards.forEach((card, i) => {
        const entry = index.decks[i];
        const hit = !q || `${entry.title} ${entry.description || ''}`.toLowerCase().includes(q);
        card.hidden = !hit;
        if (hit) shown++;
      });
      empty.hidden = shown > 0;
      if (!shown) empty.textContent = `No deck matches “${search.value.trim()}”.`;
    });
  } catch (e) {
    showError(e, error);
  }
}

/* ------------------------------------------------------------------ deck data */

async function loadSingleDeck(id) {
  state.deck = await loadDeck(id);
  state.slides = state.deck.slides;
  state.virtual = false;
  state.tag = '';
}

async function loadTagDeck(rawTag) {
  const tag = normalizeTag(rawTag);
  const index = await loadIndex();
  const decks = await Promise.all(
    index.decks.map(async (entry) => {
      try {
        return { entry, deck: await loadDeck(entry.id) };
      } catch {
        return null;
      }
    })
  );

  const slides = [];
  let updatedAt = '';
  for (const item of decks) {
    if (!item) continue;
    for (const slide of item.deck.slides) {
      if ((slide.tags || []).includes(tag)) {
        slides.push({ ...slide, _deckId: item.deck.id, _deckTitle: item.deck.title });
        if (item.deck.updatedAt > updatedAt) updatedAt = item.deck.updatedAt;
      }
    }
  }

  state.tag = tag;
  state.virtual = true;
  state.deck = {
    id: `tag-${tag}`,
    title: `#${tag}`,
    description: '',
    slides,
    updatedAt,
    virtual: true,
  };
  state.slides = slides;
}

/* ------------------------------------------------------------------ deck page */

function metaText() {
  const n = state.slides.length;
  if (state.virtual) {
    const decks = new Set(state.slides.map((s) => s._deckId));
    return `${n} video${n === 1 ? '' : 's'} tagged #${state.tag} · ${decks.size} deck${decks.size === 1 ? '' : 's'}`;
  }
  return `${n} video${n === 1 ? '' : 's'}${state.deck.updatedAt ? ` · updated ${formatDate(state.deck.updatedAt)}` : ''}`;
}

function updateUrl() {
  const params = new URLSearchParams(location.search);
  if (state.virtual) {
    params.delete('deck');
    params.set('tag', state.tag);
  } else {
    params.delete('tag');
    params.set('deck', state.deck.id);
  }
  params.set('slide', String(state.index + 1));
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}

function currentSlide() {
  return state.slides[state.index] || null;
}

function renderSlide(index, { updateHistory = true } = {}) {
  const total = state.slides.length;
  if (!total) return;
  state.index = clamp(index, 0, total - 1);
  const slide = state.slides[state.index];

  const thumb = $('#slide-thumb');
  thumb.hidden = false;
  thumb.src = slideImage(state.deck.id, slide);
  thumb.alt = slide.title ? `${slide.title} — video thumbnail` : 'Video thumbnail';

  const thumbLink = $('#thumb-link');
  thumbLink.href = slide.url;
  thumbLink.setAttribute('aria-label', `Watch ${slide.title || 'video'} on YouTube`);

  $('#slide-title').replaceChildren(
    el('a', { href: slide.url, target: '_blank', rel: 'noopener' }, slide.title || 'Untitled video')
  );

  const author = $('#slide-author');
  author.replaceChildren(
    slide.author
      ? el('a', { href: slide.authorUrl || slide.url, target: '_blank', rel: 'noopener' }, slide.author)
      : document.createTextNode('')
  );

  const source = $('#slide-source');
  source.hidden = !state.virtual;
  if (state.virtual) {
    source.replaceChildren(
      'From ',
      el('a', { href: `deck.html?deck=${encodeURIComponent(slide._deckId)}` }, slide._deckTitle || slide._deckId)
    );
  }

  const tagRow = $('#slide-tags');
  tagRow.replaceChildren(
    ...(slide.tags || []).map((tag) =>
      el('a', { class: 'tag-chip', href: `deck.html?tag=${encodeURIComponent(tag)}` }, el('span', { class: 'hash' }, '#'), tag)
    ),
    el('button', { class: 'tag-edit', type: 'button', title: 'Edit tags' }, '＋ Tag')
  );

  const note = $('#slide-note');
  note.hidden = !slide.note;
  note.textContent = slide.note || '';

  const duration = $('#duration');
  duration.hidden = !slide.duration;
  duration.textContent = slide.duration || '';

  $('#counter').textContent = `${state.index + 1} / ${total}`;
  $('#watch').href = slide.url;
  $('#btn-delete').disabled = false;
  $('#prev').disabled = state.index === 0;
  $('#next').disabled = state.index === total - 1;

  const film = $('#filmstrip');
  for (const [i, button] of [...film.children].entries()) {
    button.setAttribute('aria-current', String(i === state.index));
    if (i === state.index) button.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  document.title = `${slide.title || 'Video'} — ${state.deck.title}`;
  if (updateHistory) updateUrl();

  for (const offset of [-1, 1]) {
    const neighbour = state.slides[state.index + offset];
    if (neighbour) new Image().src = slideImage(state.deck.id, neighbour);
  }
}

function buildFilmstrip() {
  const film = $('#filmstrip');
  film.replaceChildren(
    ...state.slides.map((slide, i) => {
      const img = el('img', {
        src: slideImage(state.deck.id, slide),
        alt: '',
        loading: i < 10 ? 'eager' : 'lazy',
        decoding: 'async',
      });
      guardImage(img);
      const button = el(
        'button',
        {
          class: 'film-item',
          type: 'button',
          'aria-label': `Slide ${i + 1}: ${slide.title || 'video'}`,
          'aria-current': String(i === state.index),
        },
        img
      );
      button.addEventListener('click', () => {
        state.gridOpen = false;
        toggleGrid(false);
        renderSlide(i);
      });
      return button;
    })
  );
}

function buildGrid() {
  const grid = $('#grid');
  grid.replaceChildren(
    ...state.slides.map((slide, i) => {
      const img = el('img', {
        src: slideImage(state.deck.id, slide),
        alt: '',
        loading: 'lazy',
        decoding: 'async',
      });
      guardImage(img);
      const card = el(
        'button',
        { class: 'grid-card', type: 'button' },
        img,
        el('span', {}, `${i + 1}. ${slide.title || 'Untitled video'}`)
      );
      card.addEventListener('click', () => {
        toggleGrid(false);
        renderSlide(i);
      });
      return card;
    })
  );
}

function toggleGrid(force) {
  state.gridOpen = force ?? !state.gridOpen;
  const grid = $('#grid');
  const slide = $('#slide');
  grid.hidden = !state.gridOpen;
  slide.hidden = state.gridOpen || !state.slides.length;
  $('#btn-grid').setAttribute('aria-pressed', String(state.gridOpen));
  $('#btn-grid').textContent = state.gridOpen ? 'Slides' : 'Grid';
  if (state.gridOpen) grid.querySelector('button')?.focus({ preventScroll: true });
}

function step(delta) {
  if (state.gridOpen) return;
  const nextIndex = state.index + delta;
  if (nextIndex < 0 || nextIndex >= state.slides.length) return;
  renderSlide(nextIndex);
}

function showEmptyState() {
  $('#slide').hidden = true;
  $('#grid').hidden = true;
  $('#deck-error').hidden = false;
  $('#deck-error').textContent = state.virtual
    ? `No videos are tagged #${state.tag} yet.`
    : 'This deck has no videos yet. Use + Add video to start it.';
  $('#btn-delete').disabled = true;
  $('#prev').disabled = true;
  $('#next').disabled = true;
  $('#counter').textContent = '';
}

function refreshDeckUi() {
  $('#deck-meta').textContent = metaText();
  buildFilmstrip();
  buildGrid();
  if (!state.slides.length) {
    showEmptyState();
    return;
  }
  $('#deck-error').hidden = true;
  $('#deck-error').textContent = '';
  $('#slide').hidden = state.gridOpen;
  renderSlide(clamp(state.index, 0, state.slides.length - 1));
}

async function deleteCurrent() {
  const slide = currentSlide();
  if (!slide) return;
  const deckId = state.virtual ? slide._deckId : state.deck.id;
  const deckTitle = state.virtual ? slide._deckTitle : state.deck.title;

  const ok = await dialogs.confirm(
    `Delete “${slide.title}” from “${deckTitle}”? The slide and its thumbnail are removed; the video stays on YouTube.`,
    'Delete video'
  );
  if (!ok) return;

  const token = await connect.ensureToken();
  if (!token) return;

  try {
    const { deck } = await deleteVideoFromDeck({ token, deckId, videoId: slide.videoId });
    if (state.virtual) {
      state.slides.splice(state.index, 1);
    } else {
      state.deck = deck;
      state.slides = deck.slides;
    }
    refreshDeckUi();
    toast('Deleted. The public site updates in about a minute.', 'success');
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}

async function editTags() {
  const slide = currentSlide();
  if (!slide) return;
  const deckId = state.virtual ? slide._deckId : state.deck.id;
  const current = (slide.tags || []).map((tag) => `#${tag}`).join(', ');

  const value = await dialogs.prompt('Tags for this video', current, 'Save tags');
  if (value === null) return;

  const token = await connect.ensureToken();
  if (!token) return;

  try {
    const { deck, slide: updated } = await setSlideTags({
      token,
      deckId,
      videoId: slide.videoId,
      tags: value,
    });
    if (state.virtual) {
      slide.tags = updated.tags;
      if (!updated.tags.includes(state.tag)) {
        state.slides.splice(state.index, 1);
      }
      if (!state.slides.length) {
        refreshDeckUi();
        toast(`Tags saved. No videos are tagged #${state.tag} anymore.`, 'success');
        return;
      }
    } else {
      state.deck = deck;
      state.slides = deck.slides;
    }
    refreshDeckUi();
    renderSlide(Math.min(state.index, state.slides.length - 1));
    toast('Tags saved. The public site updates in about a minute.', 'success');
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}

async function copyCurrentLink() {
  const button = $('#copy');
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => {
    button.textContent = label;
  }, 1600);
}

async function exportDeck() {
  if (!state.deck || !state.slides.length) return;
  const button = $('#export');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing…';

  try {
    const pptx = await buildPptx(state.deck, async (slide, index) => {
      button.textContent = `Fetching ${index + 1}/${state.slides.length}…`;
      try {
        const res = await fetch(slideImage(state.deck.id, slide), { cache: 'force-cache' });
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    });

    button.textContent = 'Saving…';
    const blob = new Blob([pptx], { type: PPTX_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.deck.id}.pptx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    button.textContent = 'Downloaded';
  } catch (error) {
    console.error('export failed', error);
    button.textContent = 'Export failed';
  }

  setTimeout(() => {
    button.textContent = label;
    button.disabled = false;
  }, 1800);
}

function bindDeckEvents() {
  if (state.mounted) return;
  state.mounted = true;

  $('#prev').addEventListener('click', () => step(-1));
  $('#next').addEventListener('click', () => step(1));
  $('#btn-grid').addEventListener('click', () => toggleGrid());
  $('#copy').addEventListener('click', copyCurrentLink);
  $('#export').addEventListener('click', exportDeck);
  $('#btn-add').addEventListener('click', () => addDialog.open());
  $('#btn-delete').addEventListener('click', deleteCurrent);
  $('#slide-tags').addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.tag-edit')) editTags();
  });

  const full = $('#btn-full');
  if (!document.fullscreenEnabled) {
    full.hidden = true;
  } else {
    full.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      full.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
        event.preventDefault();
        step(1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        step(-1);
        break;
      case ' ':
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
        break;
      case 'Home':
        event.preventDefault();
        if (!state.gridOpen) renderSlide(0);
        break;
      case 'End':
        event.preventDefault();
        if (!state.gridOpen) renderSlide(state.slides.length - 1);
        break;
      case 'g':
      case 'G':
        toggleGrid();
        break;
      case 'f':
      case 'F':
        if (document.fullscreenEnabled) full.click();
        break;
      case 'Escape':
        if (state.gridOpen) toggleGrid(false);
        break;
      default:
        break;
    }
  });

  const stage = $('#stage');
  let start = null;
  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    start = { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      state.suppressClick = true;
      step(dx < 0 ? 1 : -1);
    }
  });
  stage.addEventListener(
    'click',
    (event) => {
      if (!state.suppressClick) return;
      state.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );
}

function mountDeck(initialSlide) {
  $('#deck-title').textContent = state.deck.title;
  $('#deck-meta').textContent = metaText();
  $('#btn-add').hidden = state.virtual;
  buildFilmstrip();
  buildGrid();
  bindDeckEvents();

  if (!state.slides.length) {
    showEmptyState();
    return;
  }
  $('#slide').hidden = false;
  renderSlide(Number.isFinite(initialSlide) && initialSlide > 0 ? initialSlide - 1 : 0);
}

async function bootDeck() {
  const params = new URLSearchParams(location.search);
  const deckId = params.get('deck');
  const tag = params.get('tag');
  const slide = Number(params.get('slide') || 1);
  const error = $('#deck-error');

  if (!deckId && !tag) {
    showError(new Error('No deck specified.'), error);
    return;
  }

  try {
    if (tag) await loadTagDeck(tag);
    else await loadSingleDeck(deckId);
    mountDeck(slide);
  } catch (e) {
    showError(e, error);
  }
}

/* ------------------------------------------------------------------ boot */

if (document.body.classList.contains('deck-page')) bootDeck();
else if (document.getElementById('deck-grid')) bootIndex();
