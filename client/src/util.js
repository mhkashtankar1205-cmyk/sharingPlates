import { useEffect, useState } from 'react';

export const ACCOUNT_TYPES = [
  ['individual', 'Individual'],
  ['restaurant', 'Restaurant'],
  ['hotel', 'Hotel'],
  ['caterer', 'Caterer'],
  ['event', 'Event organiser'],
  ['ngo', 'NGO'],
  ['hostel', 'Hostel'],
  ['shelter', 'Shelter'],
];
export const ACCOUNT_LABEL = Object.fromEntries(ACCOUNT_TYPES);

export const SOURCES = [
  ['home', 'Home'],
  ['restaurant', 'Restaurant'],
  ['hotel', 'Hotel'],
  ['wedding', 'Wedding'],
  ['party', 'Party'],
  ['event', 'Event'],
  ['other', 'Other'],
];
export const SOURCE_LABEL = Object.fromEntries(SOURCES);

export const FOOD_TYPES = [
  ['veg', 'Veg'],
  ['nonveg', 'Non-veg'],
  ['vegan', 'Vegan'],
  ['mixed', 'Veg & non-veg'],
];
export const FOOD_LABEL = Object.fromEntries(FOOD_TYPES);

export const POST_STATUS = {
  active: 'Active',
  requested: 'Requested',
  partial: 'Partially claimed',
  claimed: 'Claimed',
  completed: 'Completed',
  inactive: 'Inactive',
};

export const REQUEST_STATUS = {
  pending: 'Waiting for provider',
  accepted: 'Ready for pickup',
  declined: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Picked up',
  expired: 'Expired',
};

const MIN = 60000;

/** Re-renders the caller every `ms` so countdowns stay current. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function timeLeft(until, now = Date.now()) {
  const mins = Math.round((until - now) / MIN);
  if (mins <= 0) return 'Expired';
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  return `${h}h ${mins % 60}m left`;
}

export const isUrgent = (p, now = Date.now()) => p.open && p.available_until - now <= 60 * MIN;

export function clock(t) {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dayClock(t, now = Date.now()) {
  const d = new Date(t);
  const today = new Date(now);
  const tomorrow = new Date(now + 86400000);
  if (d.toDateString() === today.toDateString()) return `today, ${clock(t)}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow, ${clock(t)}`;
  return d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function ago(t, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - t) / MIN));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function km(d) {
  if (d == null) return '';
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}

export function initials(name = '') {
  return name
    .replace(/[^\p{L} ]/gu, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

/** Value for a <input type="datetime-local"> in local time. */
export function toLocalInput(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Browser geolocation as a promise. */
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Your browser does not support location.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Location permission was denied. Pick your spot on the map instead.')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
