/**
 * connect.js — the shared "Connect GitHub" dialog.
 *
 * `ensureToken()` resolves true when a token is available (already stored or just saved) and false
 * when the user cancels.
 */

import { config, getToken, setToken, checkToken, friendlyError } from './github.js';

export function setupConnect() {
  const dialog = document.getElementById('connect-dialog');
  if (!dialog) {
    return { ensureToken: async () => getToken() };
  }

  const input = document.getElementById('connect-token');
  const status = document.getElementById('connect-status');
  const save = document.getElementById('connect-save');
  const clear = document.getElementById('connect-clear');
  const repoLabel = document.getElementById('connect-repo');
  let pending = null;

  if (repoLabel) repoLabel.textContent = config.repo || 'this repository';

  function write(message, kind = 'info') {
    status.textContent = message || '';
    status.dataset.kind = kind;
    status.hidden = !message;
  }

  function settle(value) {
    const resolve = pending;
    pending = null;
    if (resolve) resolve(value);
  }

  save?.addEventListener('click', async () => {
    const token = input.value.trim();
    if (!token) {
      write('Paste a token first.', 'error');
      return;
    }
    save.disabled = true;
    write('Checking token…', 'info');
    try {
      const info = await checkToken(token);
      if (!info.canPush) {
        write(`Connected as ${info.login}, but the token has no write access. Add Contents: Read and write and save again.`, 'error');
        return;
      }
      setToken(token);
      input.value = '';
      write(`Connected as ${info.login}.`, 'success');
      settle(getToken());
      setTimeout(() => dialog.close(), 400);
    } catch (error) {
      write(friendlyError(error), 'error');
    } finally {
      save.disabled = false;
    }
  });

  clear?.addEventListener('click', () => {
    setToken('');
    input.value = '';
    write('Token forgotten on this browser.', 'info');
  });

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save.click();
    }
  });

  dialog.addEventListener('close', () => {
    input.value = '';
    if (pending) settle(getToken());
  });

  return {
    async ensureToken() {
      if (getToken()) return getToken();
      write('A token is stored only in this browser and only used to commit to this repository.', 'info');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      setTimeout(() => input.focus(), 50);
      return new Promise((resolve) => {
        pending = resolve;
      });
    },
  };
}
