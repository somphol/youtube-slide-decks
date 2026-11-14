/**
 * tags.js — the tag management page.
 * Lists tags from the catalog, links each to a filtered deck, and commits rename/delete operations.
 */

import { getToken, friendlyError } from './github.js';
import { setupConnect } from './connect.js';
import { setupDialogs } from './dialogs.js';
import { renameTagEverywhere, deleteTagEverywhere } from './mutations.js';
import { tallyTags } from './tags.mjs';

const $ = (selector) => document.querySelector(selector);
const state = { tags: [], query: '' };

const connect = setupConnect();
const dialogs = setupDialogs();

async function loadTags() {
  const res = await fetch('decks/index.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Catalog not found (HTTP ${res.status}).`);
  const index = await res.json();
  if (Array.isArray(index.tags)) return index.tags;

  // Older catalog: derive the tally from the decks.
  const decks = await Promise.all(
    (index.decks || []).map(async (entry) => {
      const response = await fetch(`decks/${encodeURIComponent(entry.id)}/deck.json`, { cache: 'no-store' });
      return response.ok ? response.json() : { slides: [] };
    })
  );
  return tallyTags(decks);
}

function tagCard(tag) {
  const main = document.createElement('a');
  main.className = 'tag-card-main';
  main.href = `deck.html?tag=${encodeURIComponent(tag.name)}`;
  main.innerHTML = '<span class="hash" aria-hidden="true">#</span>';
  main.append(document.createTextNode(tag.name));

  const meta = document.createElement('p');
  meta.className = 'tag-count';
  meta.textContent = `${tag.count} video${tag.count === 1 ? '' : 's'}`;

  const actions = document.createElement('div');
  actions.className = 'tag-actions';

  const rename = document.createElement('button');
  rename.type = 'button';
  rename.className = 'btn ghost tiny';
  rename.textContent = 'Rename';
  rename.addEventListener('click', () => renameTag(tag));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn ghost tiny danger';
  remove.textContent = 'Delete';
  remove.addEventListener('click', () => removeTag(tag));

  actions.append(rename, remove);

  const card = document.createElement('article');
  card.className = 'tag-card';
  card.dataset.tag = tag.name;
  card.append(main, meta, actions);
  return card;
}

function render() {
  const grid = $('#tag-grid');
  const empty = $('#tags-empty');
  const query = state.query.trim().toLowerCase();
  const shown = state.tags.filter((tag) => !query || tag.name.includes(query));

  grid.replaceChildren(...shown.map(tagCard));
  empty.hidden = shown.length > 0;
  empty.textContent = state.tags.length ? 'No tag matches that search.' : 'No tags yet. Add tags when you add or edit a video.';

  const videos = state.tags.reduce((sum, tag) => sum + tag.count, 0);
  $('#tag-stats').textContent = `${state.tags.length} tag${state.tags.length === 1 ? '' : 's'} · ${videos} tagged video${videos === 1 ? '' : 's'}`;
}

async function renameTag(tag) {
  const value = await dialogs.prompt(`Rename #${tag.name}`, tag.name, 'Rename');
  if (value === null) return;
  if (!value.trim()) return;

  const token = await connect.ensureToken();
  if (!token) return;

  try {
    setBusy(true, `Renaming #${tag.name}…`);
    const result = await renameTagEverywhere({ token, from: tag.name, to: value });
    if (result.unchanged) return;
    state.tags = result.tags;
    setBusy(false, `Renamed. ${result.affectedSlides} video${result.affectedSlides === 1 ? '' : 's'} updated; the site follows in about a minute.`);
    render();
  } catch (error) {
    setBusy(false, friendlyError(error), 'error');
  }
}

async function removeTag(tag) {
  const ok = await dialogs.confirm(
    `Delete #${tag.name}? It will be removed from ${tag.count} video${tag.count === 1 ? '' : 's'}. The videos stay in their decks.`,
    'Delete tag'
  );
  if (!ok) return;

  const token = await connect.ensureToken();
  if (!token) return;

  try {
    setBusy(true, `Deleting #${tag.name}…`);
    const result = await deleteTagEverywhere({ token, name: tag.name });
    state.tags = result.tags;
    setBusy(false, `Deleted. ${result.affectedSlides} video${result.affectedSlides === 1 ? '' : 's'} updated.`);
    render();
  } catch (error) {
    setBusy(false, friendlyError(error), 'error');
  }
}

function setBusy(busy, message, kind = 'info') {
  for (const button of document.querySelectorAll('.tag-actions button')) button.disabled = busy;
  const status = $('#manage-status');
  status.textContent = message || '';
  status.dataset.kind = kind;
  status.hidden = !message;
}

$('#connect-btn')?.addEventListener('click', async () => {
  const token = await connect.ensureToken();
  const status = $('#manage-status');
  if (token) {
    status.hidden = false;
    status.dataset.kind = 'success';
    status.textContent = getToken() ? 'Connected. Rename and delete now commit to GitHub.' : '';
  }
});

const search = $('#tag-search');
search?.addEventListener('input', () => {
  state.query = search.value;
  render();
});

try {
  state.tags = await loadTags();
  render();
} catch (error) {
  const target = $('#tags-error');
  target.hidden = false;
  target.textContent =
    location.protocol === 'file:'
      ? 'Open this page through a local server or the published site.'
      : friendlyError(error);
}
