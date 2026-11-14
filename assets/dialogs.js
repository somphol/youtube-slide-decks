/**
 * dialogs.js — shared confirm and prompt dialogs.
 */

export function setupDialogs() {
  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmMessage = document.getElementById('confirm-message');
  const confirmYes = document.getElementById('confirm-yes');
  const confirmCancel = document.getElementById('confirm-cancel');

  const promptDialog = document.getElementById('prompt-dialog');
  const promptTitle = document.getElementById('prompt-title');
  const promptInput = document.getElementById('prompt-input');
  const promptSave = document.getElementById('prompt-save');
  const promptCancel = document.getElementById('prompt-cancel');

  let confirmResolve = null;
  let promptResolve = null;

  function open(dialog) {
    if (!dialog) return false;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return true;
  }

  if (confirmDialog) {
    confirmYes?.addEventListener('click', () => {
      const resolve = confirmResolve;
      confirmResolve = null;
      confirmDialog.close();
      resolve?.(true);
    });
    confirmCancel?.addEventListener('click', () => {
      const resolve = confirmResolve;
      confirmResolve = null;
      confirmDialog.close();
      resolve?.(false);
    });
    confirmDialog.addEventListener('close', () => {
      const resolve = confirmResolve;
      confirmResolve = null;
      resolve?.(false);
    });
  }

  if (promptDialog) {
    promptSave?.addEventListener('click', () => {
      const resolve = promptResolve;
      promptResolve = null;
      promptDialog.close();
      resolve?.(promptInput.value.trim());
    });
    promptCancel?.addEventListener('click', () => {
      const resolve = promptResolve;
      promptResolve = null;
      promptDialog.close();
      resolve?.(null);
    });
    promptDialog.addEventListener('close', () => {
      const resolve = promptResolve;
      promptResolve = null;
      resolve?.(null);
    });
    promptInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        promptSave.click();
      }
    });
  }

  return {
    confirm(message, label = 'Delete') {
      if (!confirmDialog) return Promise.resolve(window.confirm(message));
      confirmMessage.textContent = message;
      confirmYes.textContent = label;
      open(confirmDialog);
      return new Promise((resolve) => {
        confirmResolve = resolve;
      });
    },
    prompt(title, value = '', label = 'Save') {
      if (!promptDialog) return Promise.resolve(window.prompt(title, value));
      promptTitle.textContent = title;
      promptInput.value = value;
      promptSave.textContent = label;
      open(promptDialog);
      setTimeout(() => {
        promptInput.focus();
        promptInput.select();
      }, 50);
      return new Promise((resolve) => {
        promptResolve = resolve;
      });
    },
  };
}
