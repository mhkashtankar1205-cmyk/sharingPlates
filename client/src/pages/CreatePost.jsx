import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api.js';
import { LocationPicker } from '../components/maps.jsx';
import { Icon, PageHead } from '../components/ui.jsx';
import { useAuth, useLive } from '../state.jsx';
import { FOOD_TYPES, SOURCES, dayClock, toLocalInput } from '../util.js';

const H = 3600000;

function quickTimes(now) {
  const tonight = new Date(now);
  tonight.setHours(23, 0, 0, 0);
  const list = [
    ['1 hour', now + H],
    ['2 hours', now + 2 * H],
    ['4 hours', now + 4 * H],
  ];
  if (tonight.getTime() - now > 4.5 * H) list.push(['11 pm tonight', tonight.getTime()]);
  return list;
}

const DISH_PRESETS = [
  { name: 'Wedding Biryani Trays', type: 'veg', url: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=600&q=80' },
  { name: 'Hotel Buffet Paneer', type: 'veg', url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80' },
  { name: 'Party Dal & Rice Pots', type: 'veg', url: 'https://images.unsplash.com/photo-1613564834361-9436948817d1?auto=format&fit=crop&w=600&q=80' },
  { name: 'Idli & Sambar Batch', type: 'veg', url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80' },
  { name: 'Prasadam / Sweet Boxes', type: 'veg', url: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=600&q=80' },
  { name: 'Banquet Chicken Curry', type: 'nonveg', url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80' },
  { name: 'Catering Meal Boxes', type: 'veg', url: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80' },
  { name: 'Hotel Breakfast Buffet', type: 'veg', url: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=600&q=80' },
];

export default function CreatePost() {
  const { user } = useAuth();
  const { toast } = useLive();
  const navigate = useNavigate();
  const [now] = useState(Date.now());
  const [f, setF] = useState({
    title: '',
    description: '',
    food_type: 'veg',
    source: user.account_type === 'hotel' ? 'hotel' : user.account_type === 'restaurant' ? 'restaurant' : 'home',
    quantity: '',
    until: toLocalInput(now + 2 * H),
    address: '',
    locality: user.locality || '',
    pickup_notes: '',
    active: true,
  });
  const [loc, setLoc] = useState(user.has_location ? { lat: user.lat, lng: user.lng } : null);
  const [photo, setPhoto] = useState(null);
  const [presetPhoto, setPresetPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    if (photo) {
      const url = URL.createObjectURL(photo);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    if (presetPhoto) {
      setPreview(presetPhoto);
      return;
    }
    setPreview(null);
  }, [photo, presetPhoto]);

  function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return setError('Use a JPG, PNG, WebP or GIF photo.');
    if (file.size > 6 * 1024 * 1024) return setError('That photo is over 6 MB. Pick a smaller one.');
    setError(null);
    setPresetPhoto(null);
    setPhoto(file);
  }

  function selectPreset(item) {
    setPhoto(null);
    setPresetPhoto(item.url);
    if (!f.title) setF((prev) => ({ ...prev, title: item.name, food_type: item.type }));
  }

  async function submit(e) {
    e.preventDefault();
    const until = new Date(f.until).getTime();
    if (!loc) return setError('Place the pickup pin on the map.');
    if (!Number.isFinite(until)) return setError('Choose until when the food is available.');
    setBusy(true);
    setError(null);
    const form = new FormData();
    for (const k of ['title', 'description', 'food_type', 'source', 'quantity', 'address', 'locality', 'pickup_notes']) form.set(k, f[k]);
    form.set('available_until', String(until));
    form.set('is_active', f.active ? 'true' : 'false');
    form.set('lat', String(loc.lat));
    form.set('lng', String(loc.lng));
    if (photo) form.set('image', photo);
    else if (presetPhoto) form.set('preset_image', presetPhoto);
    try {
      const { post, matched } = await api('/posts', { method: 'POST', form });
      toast(
        f.active
          ? `Posted. ${matched} nearby ${matched === 1 ? 'receiver was' : 'receivers were'} notified.`
          : 'Saved as inactive. Make it active from the post page when you are ready.'
      );
      navigate(`/posts/${post.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <PageHead title="Share extra food" sub="Nearby hostels, NGOs and people are notified as soon as you post." />
      <form className="stack form-card" onSubmit={submit}>
        <div className="field">
          <span>Food photo</span>
          <label className={`upload ${preview ? 'has' : ''}`} htmlFor="p-photo">
            {preview ? (
              <img src={preview} alt="Selected food" />
            ) : (
              <span>
                <Icon name="photo" size={30} />
                <b>Add a food photo</b>
                <small>A clear photo gets food claimed faster · Upload custom image or select a dish preset below</small>
              </span>
            )}
            <input id="p-photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pickPhoto} />
          </label>
          {preview && (
            <button type="button" className="link" onClick={() => { setPhoto(null); setPresetPhoto(null); }}>
              Remove photo
            </button>
          )}

          <div className="preset-gallery-title">Or pick from sample dish photos:</div>
          <div className="preset-grid">
            {DISH_PRESETS.map((item) => (
              <button
                key={item.name}
                type="button"
                className={`preset-card ${presetPhoto === item.url ? 'active' : ''}`}
                onClick={() => selectPreset(item)}
              >
                <img src={item.url} alt={item.name} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Food name</span>
          <input id="p-title" required minLength={3} maxLength={100} value={f.title} onChange={set('title')} placeholder="e.g. Veg pulao, dal & gulab jamun" />
        </label>
        <label className="field">
          <span>Details (optional)</span>
          <textarea id="p-desc" rows="2" maxLength={600} value={f.description} onChange={set('description')} placeholder="How it was stored, allergens, packed or loose…" />
        </label>

        <div className="field">
          <span>Type</span>
          <div className="seg">
            {FOOD_TYPES.map(([v, l]) => (
              <button type="button" key={v} className={f.food_type === v ? 'on' : ''} aria-pressed={f.food_type === v} onClick={() => setF({ ...f, food_type: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="two">
          <label className="field">
            <span>From</span>
            <select id="p-source" value={f.source} onChange={set('source')}>
              {SOURCES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Number of meals</span>
            <input id="p-qty" type="number" inputMode="numeric" required min="1" max="2000" value={f.quantity} onChange={set('quantity')} placeholder="e.g. 30" />
          </label>
        </div>

        <div className="field">
          <span>Available until</span>
          <input id="p-until" type="datetime-local" required value={f.until} min={toLocalInput(now + 10 * 60000)} onChange={set('until')} />
          <div className="chips">
            {quickTimes(now).map(([l, t]) => (
              <button type="button" key={l} className="chip" onClick={() => setF({ ...f, until: toLocalInput(t) })}>
                {l}
              </button>
            ))}
          </div>
          <small className="hint">Until {dayClock(new Date(f.until).getTime())}. Receivers get an urgent alert 45 minutes before.</small>
        </div>

        <label className="field">
          <span>Pickup address</span>
          <input id="p-address" required minLength={5} maxLength={200} value={f.address} onChange={set('address')} placeholder="Building, street, landmark" />
          <small className="hint">Only shared with people whose request you accept.</small>
        </label>
        <div className="two">
          <label className="field">
            <span>Locality (shown publicly)</span>
            <input id="p-locality" maxLength={80} value={f.locality} onChange={set('locality')} placeholder="e.g. Koramangala" />
          </label>
          <label className="field">
            <span>Pickup notes (optional)</span>
            <input id="p-notes" maxLength={300} value={f.pickup_notes} onChange={set('pickup_notes')} placeholder="Gate, contact person, bring containers…" />
          </label>
        </div>
        <div className="field">
          <span>Pickup point</span>
          <LocationPicker value={loc} onChange={setLoc} />
        </div>

        <label className="toggle">
          <span>
            <b>Mark as Active</b>
            <small>Show it in the feed and alert nearby receivers now</small>
          </span>
          <span className="switch">
            <input id="p-active" type="checkbox" checked={f.active} onChange={set('active')} />
            <i />
          </span>
        </label>

        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="btn full lg" disabled={busy}>
          <Icon name="send" size={18} />
          {busy ? 'Posting…' : f.active ? 'Post food' : 'Save as inactive'}
        </button>
      </form>
    </div>
  );
}
