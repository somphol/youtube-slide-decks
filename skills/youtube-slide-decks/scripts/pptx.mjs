/**
 * pptx.mjs — Node wrapper around pptx-core.mjs.
 * Resolves thumbnails from disk (falling back to i.ytimg.com), then delegates the package build.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPptx as buildCore } from '../assets/site/assets/pptx-core.mjs';

async function readThumbnail(deckDir, slide) {
  if (slide.thumbnail) {
    try {
      const buf = await fs.readFile(path.join(deckDir, slide.thumbnail));
      if (buf.length) return buf;
    } catch {
      // fall through to remote
    }
  }
  const remote = slide.thumbnailUrl || `https://i.ytimg.com/vi/${slide.videoId}/hqdefault.jpg`;
  try {
    const res = await fetch(remote, {
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'image/jpeg,image/*' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1000 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} deck deck.json contents
 * @param {string} deckDir absolute directory holding deck.json and thumbnails/
 * @returns {Promise<Buffer>} .pptx bytes
 */
export async function buildPptx(deck, deckDir) {
  const bytes = await buildCore(deck, (slide) => readThumbnail(deckDir, slide));
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
