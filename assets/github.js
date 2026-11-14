/**
 * github.js — the shared GitHub plumbing for browser writes.
 *
 * A static site cannot write files. Writes go through the GitHub REST API with a fine-grained token
 * (Contents: read and write) kept in localStorage for that browser only. Every request goes to
 * api.github.com; the token is never sent anywhere else.
 */

export const config = {
  repo: document.querySelector('meta[name="decks-repo"]')?.content?.trim() || '',
  branch: document.querySelector('meta[name="decks-branch"]')?.content?.trim() || 'main',
};

if (!config.repo && location.hostname.endsWith('.github.io')) {
  const owner = location.hostname.split('.')[0];
  const name = location.pathname.split('/').filter(Boolean)[0];
  if (owner && name) config.repo = `${owner}/${name}`;
}

const API = 'https://api.github.com';

function tokenKey() {
  return `ytdecks.token.${config.repo || 'unknown'}`;
}

export function getToken() {
  try {
    return localStorage.getItem(tokenKey()) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(tokenKey(), token);
    else localStorage.removeItem(tokenKey());
  } catch {
    // storage unavailable: the token only lasts this page
  }
}

export async function gh(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const error = new Error(data.message || `GitHub returned ${res.status}`);
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}

export function friendlyError(error) {
  if (!navigator.onLine) return 'You are offline.';
  if (error?.status === 401) return 'The token was rejected. Create a new one or check that it has not expired.';
  if (error?.status === 403) return 'The token cannot write to this repository. It needs Contents: Read and write.';
  if (error?.status === 404) return `The token cannot see ${config.repo || 'this repository'}.`;
  if (error?.status === 409 || error?.status === 422)
    return 'The repository changed while saving. Try again in a moment.';
  if (error?.status === 429) return 'GitHub is rate limiting. Wait a minute and try again.';
  return error?.message || 'Something went wrong.';
}

export async function checkToken(token) {
  const data = await gh(`/repos/${config.repo}`, { token });
  return {
    login: data.owner?.login || '',
    canPush: Boolean(data.permissions?.push),
  };
}

function base64ToBytes(text) {
  const binary = atob(String(text).replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function readRepoFile(path, token, ref = config.branch) {
  const data = await gh(`/repos/${config.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, { token });
  if (!data || Array.isArray(data) || typeof data.content !== 'string') {
    throw new Error(`${path} is not a file`);
  }
  return new TextDecoder().decode(base64ToBytes(data.content));
}

export async function readRepoJson(path, token) {
  return JSON.parse(await readRepoFile(path, token));
}

/**
 * Commit a set of file writes and deletions as one commit on the configured branch.
 *
 * @param {object} options
 * @param {string} options.token
 * @param {Array<{path: string, text?: string, bytes?: Uint8Array}>} options.files
 * @param {string[]} [options.deletes] repository paths to remove
 * @param {string} options.message
 */
export async function commitChanges({ token, files, deletes = [], message }) {
  const branchPath = config.branch.split('/').map(encodeURIComponent).join('/');
  const ref = await gh(`/repos/${config.repo}/git/ref/heads/${branchPath}`, { token });
  const baseSha = ref.object.sha;
  const base = await gh(`/repos/${config.repo}/git/commits/${baseSha}`, { token });

  const tree = files.map((file) =>
    file.bytes
      ? { path: file.path, mode: '100644', type: 'blob', content: bytesToBase64(file.bytes) }
      : { path: file.path, mode: '100644', type: 'blob', content: file.text }
  );
  for (const path of deletes) {
    tree.push({ path, mode: '100644', type: 'blob', sha: null });
  }

  const newTree = await gh(`/repos/${config.repo}/git/trees`, {
    token,
    method: 'POST',
    body: { base_tree: base.tree.sha, tree },
  });
  const commit = await gh(`/repos/${config.repo}/git/commits`, {
    token,
    method: 'POST',
    body: { message, tree: newTree.sha, parents: [baseSha] },
  });
  await gh(`/repos/${config.repo}/git/refs/heads/${branchPath}`, {
    token,
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });

  return { sha: commit.sha, url: `https://github.com/${config.repo}/commit/${commit.sha}` };
}

export function jsonFile(path, value) {
  return { path, text: `${JSON.stringify(value, null, 2)}\n` };
}
