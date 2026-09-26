import { useState } from 'react';
import { api } from '../api.js';
import { LocationPicker } from '../components/maps.jsx';
import { PageHead } from '../components/ui.jsx';
import { useAuth, useLive, useTheme } from '../state.jsx';
import { ACCOUNT_TYPES } from '../util.js';

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const { toast } = useLive();
  const { theme, toggleTheme } = useTheme();
  const [f, setF] = useState({
    name: user.name,
    account_type: user.account_type,
    phone: user.phone || '',
    bio: user.bio || '',
    locality: user.locality || '',
    radius_km: user.radius_km,
    notify_nearby: user.notify_nearby,
  });
  const [loc, setLoc] = useState(user.has_location ? { lat: user.lat, lng: user.lng } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, radius_km: Number(f.radius_km) };
      if (loc) Object.assign(body, { lat: loc.lat, lng: loc.lng });
      const { user: next } = await api('/auth/me', { method: 'PATCH', body });
      setUser(next);
      toast('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <PageHead title="Settings" sub={user.email} />
      <form className="stack form-card" onSubmit={save}>
        <h2>Profile</h2>
        <label className="field">
          <span>Name or organisation</span>
          <input id="s-name" required minLength={2} value={f.name} onChange={set('name')} />
        </label>
        <div className="two">
          <label className="field">
            <span>Account type</span>
            <select id="s-type" value={f.account_type} onChange={set('account_type')}>
              {ACCOUNT_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Phone (shared only with confirmed pickups)</span>
            <input id="s-phone" type="tel" value={f.phone} onChange={set('phone')} />
          </label>
        </div>
        <label className="field">
          <span>About (optional)</span>
          <textarea id="s-bio" rows="2" maxLength={280} value={f.bio} onChange={set('bio')} placeholder="e.g. Hostel for 120 students; we can collect after 6 pm." />
        </label>

        <h2>Appearance & Theme</h2>
        <div className="toggle" onClick={toggleTheme}>
          <span>
            <b>{theme === 'light' ? 'Light Theme Active' : 'Black / Dark Theme Active'}</b>
            <small>Switch between bright Instagram Light theme and pure OLED Black theme</small>
          </span>
          <span className="switch">
            <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
            <i />
          </span>
        </div>

        <h2>Location & alerts</h2>
        <label className="field">
          <span>Locality</span>
          <input id="s-locality" value={f.locality} onChange={set('locality')} placeholder="e.g. Koramangala" />
        </label>
        <div className="field">
          <span>Your location</span>
          <LocationPicker value={loc} onChange={setLoc} height={220} />
        </div>
        <label className="field">
          <span>
            Alert me about food within <b className="ink mono">{Number(f.radius_km).toFixed(1)} km</b>
          </span>
          <input id="s-radius" type="range" min="0.5" max="25" step="0.5" value={f.radius_km} onChange={set('radius_km')} />
        </label>
        <label className="toggle">
          <span>
            <b>Nearby food alerts</b>
            <small>Get notified when food is posted in your area, and before it expires</small>
          </span>
          <span className="switch">
            <input id="s-notify" type="checkbox" checked={f.notify_nearby} onChange={set('notify_nearby')} />
            <i />
          </span>
        </label>

        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="row-btns">
          <button type="button" className="btn ghost" onClick={logout}>
            Log out
          </button>
          <button className="btn grow" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
