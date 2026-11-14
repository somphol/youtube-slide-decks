/**
 * add.js — the "Add video" dialog.
 * Metadata, thumbnail and commit are handled by mutations.js; the token by connect.js.
 */

import { addVideoToDeck, videoIdFrom } from './mutations.js';
import { friendlyError } from './github.js';

export function setupAddVideo({ ensureToken, getDeck, onAdded }) {
  const dialog = document.getElementById('add-dialog');
  if (!dialog) return { open() {} };

  const urlInput = document.getElementById('add-url');
  const noteInput = document.getElementById('add-note');
  const tagsInput = document.getElementById('add-tags');
  const status = document.getElementById('add-status');
  const submit = document.getElementById('add-submit');
  let busy = false;

  function write(message, kind = 'info') {
    status.textContent = message || '';
    status.dataset.kind = kind;
    status.hidden = !message;
  }

  submit?.addEventListener('click', async () => {
    if (busy) return;
    const deck = getDeck();
    if (!deck || deck.virtual) {
      write('Open a single deck to add a video.', 'error');
      return;
    }
    if (!videoIdFrom(urlInput.value)) {
      write('Paste a full YouTube link, for example https://youtu.be/I2QhfZ0aVmk.', 'error');
      urlInput.focus();
      return;
    }

    const token = await ensureToken();
    if (!token) return;

    busy = true;
    submit.disabled = true;
    submit.textContent = 'Adding…';
    write('Reading video and saving…', 'info');

    try {
      const { slide, deck: updatedDeck, commitUrl } = await addVideoToDeck({
        token,
        deckId: deck.id,
        url: urlInput.value,
        note: noteInput.value.trim(),
        tags: tagsInput.value,
      });
      write(`Added “${slide.title}”. The public site updates in about a minute.`, 'success');
      onAdded(slide, updatedDeck, commitUrl);
      setTimeout(() => dialog.close(), 1600);
    } catch (error) {
      write(friendlyError(error), 'error');
    } finally {
      busy = false;
      submit.textContent = 'Add video';
      submit.disabled = false;
    }
  });

  dialog.addEventListener('close', () => {
    urlInput.value = '';
    noteInput.value = '';
    tagsInput.value = '';
    submit.textContent = 'Add video';
    submit.disabled = false;
    write('');
  });

  for (const input of [urlInput, tagsInput, noteInput]) {
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit.click();
      }
    });
  }

  return {
    open() {
      write('');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      setTimeout(() => urlInput.focus(), 50);
    },
  };
}
