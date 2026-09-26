import { request, resetDemoData } from './local-api/browser.js';

export { subscribe } from './local-api/browser.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Shrinks a photo to at most `max` px on its longest side, as a JPEG data URL that can be saved in the browser. */
async function photoDataUrl(file, max = 1000) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ApiError('That photo could not be read. Try a different JPG or PNG.', 400);
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

/** Asks first, then deletes this browser's data and starts again with the demo data. */
export function confirmReset() {
  if (window.confirm('Delete all accounts, posts and requests saved in this browser and start again with the demo data?')) resetDemoData();
}

async function formBody(form) {
  const body = {};
  for (const [key, value] of form) body[key] = typeof value === 'string' ? value : await photoDataUrl(value);
  return body;
}

/**
 * Calls the app's API, which runs in this browser (see local-api/browser.js).
 * Pass `body` for JSON-style data or `form` for a FormData with a photo.
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const payload = form ? await formBody(form) : body;
  let res;
  try {
    res = await request(method, path, payload);
  } catch (err) {
    console.error(err);
    throw new ApiError('sharingPlates could not open its data in this browser. Reload the page and try again.', 0);
  }
  if (res.status >= 400) throw new ApiError(res.data?.error || `Request failed (${res.status}).`, res.status);
  return res.data;
}
