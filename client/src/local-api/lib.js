export const ACCOUNT_TYPES = ['individual', 'restaurant', 'hotel', 'caterer', 'event', 'ngo', 'hostel', 'shelter'];
export const RECEIVER_TYPES = new Set(['ngo', 'hostel', 'shelter']);
export const SOURCES = ['home', 'restaurant', 'hotel', 'wedding', 'party', 'event', 'other'];
export const FOOD_TYPES = ['veg', 'nonveg', 'vegan', 'mixed'];

/** Rough conversion factors used for the impact dashboard. */
export const KG_PER_MEAL = 0.35;
export const CO2E_PER_KG = 2.5;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const now = () => Date.now();

/** Random hex string of `bytes` bytes, from the Web Crypto API. */
export function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Random integer from min (inclusive) to max (exclusive). */
export function randomInt(min, max) {
  return min + (crypto.getRandomValues(new Uint32Array(1))[0] % (max - min));
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Lat/lng bounding box around a point, for a cheap SQL prefilter before the exact distance check. */
export function boundingBox(lat, lng, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export function formatDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const formatKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

// ---- input validation -------------------------------------------------------

export function str(value, field, { min = 0, max = 500, required = true } = {}) {
  const s = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  if (!s && required) throw new HttpError(400, `${field} is required.`);
  if (s.length < min) throw new HttpError(400, `${field} must be at least ${min} characters.`);
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return s || null;
}

export function int(value, field, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, `${field} must be a whole number.`);
  if (n < min || n > max) throw new HttpError(400, `${field} must be between ${min} and ${max}.`);
  return n;
}

export function num(value, field, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${field} is invalid.`);
  return n;
}

export function oneOf(value, field, options) {
  if (!options.includes(value)) throw new HttpError(400, `${field} must be one of: ${options.join(', ')}.`);
  return value;
}

export function coords(lat, lng) {
  return { lat: num(lat, 'Latitude', { min: -90, max: 90 }), lng: num(lng, 'Longitude', { min: -180, max: 180 }) };
}
