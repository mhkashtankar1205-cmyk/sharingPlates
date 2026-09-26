import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Logo } from '../components/Layout.jsx';
import { LocationPicker } from '../components/maps.jsx';
import { Icon } from '../components/ui.jsx';
import { useAuth } from '../state.jsx';
import { ACCOUNT_LABEL, ACCOUNT_TYPES } from '../util.js';

const FLOW = [
  ['Post food', 'A wedding, hotel or home shares extra meals with a photo and a pickup time.'],
  ['Match nearby', 'Hostels, NGOs and people whose area covers the pickup point are picked out.'],
  ['Notify', 'They get an alert — and a louder one if the food is about to expire.'],
  ['Request', 'A receiver asks for the number of meals they can use.'],
  ['Accept', 'The provider accepts; the address and a pickup code are shared.'],
  ['Pick up', 'The receiver shows the code at handover.'],
  ['Completed', 'Meals are counted towards everyone’s impact.'],
];

function LoginForm({ onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(null);

  useEffect(() => {
    api('/demo-accounts').then(setDemo).catch(() => {});
  }, []);

  async function login(creds) {
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: creds });
      onDone(user);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          login({ email, password });
        }}
      >
        <label className="field">
          <span>Email</span>
          <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="field-error">{error}</p>}
        <button className="btn full" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      {demo?.accounts?.length > 0 && (
        <div className="demo">
          <p className="eyebrow">Try a demo account</p>
          <div className="demo-list">
            {demo.accounts.map((a) => (
              <button key={a.email} className="demo-btn" disabled={busy} onClick={() => login({ email: a.email, password: demo.password })}>
                <b>{a.name}</b>
                <small>{ACCOUNT_LABEL[a.account_type]}</small>
              </button>
            ))}
          </div>
          <p className="fine">
            Tip: open a second browser (or a private window) as a different account to see requests and alerts arrive live.
          </p>
        </div>
      )}
    </>
  );
}

function SignupForm({ onDone }) {
  const [f, setF] = useState({ name: '', email: '', password: '', account_type: 'individual', phone: '', locality: '' });
  const [loc, setLoc] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!loc) return setError('Place your pin on the map so we can show food near you.');
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/auth/signup', { method: 'POST', body: { ...f, lat: loc.lat, lng: loc.lng } });
      onDone(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Name or organisation</span>
        <input id="su-name" required minLength={2} autoComplete="name" value={f.name} onChange={set('name')} placeholder="e.g. Nest Girls' Hostel" />
      </label>
      <div className="two">
        <label className="field">
          <span>Email</span>
          <input id="su-email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
        </label>
        <label className="field">
          <span>Password</span>
          <input id="su-password" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} placeholder="8+ characters" />
        </label>
      </div>
      <div className="two">
        <label className="field">
          <span>I am a…</span>
          <select id="su-type" value={f.account_type} onChange={set('account_type')}>
            {ACCOUNT_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Phone (shared at pickup)</span>
          <input id="su-phone" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} />
        </label>
      </div>
      <label className="field">
        <span>Locality</span>
        <input id="su-locality" value={f.locality} onChange={set('locality')} placeholder="e.g. Koramangala" />
      </label>
      <div className="field">
        <span>Where are you based?</span>
        <LocationPicker value={loc} onChange={setLoc} height={200} hint={loc ? 'Pin placed. Drag to adjust.' : 'Tap the map or use your location.'} />
      </div>
      {error && <p className="field-error">{error}</p>}
      <button className="btn full" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
      <p className="fine">Everyone can both share and request food. Your exact location is never shown to others.</p>
    </form>
  );
}

export default function Landing() {
  const { setUser } = useAuth();
  const [mode, setMode] = useState('login');

  return (
    <div className="landing">
      <section className="landing-hero">
        <Logo />
        <h1>
          Extra food,
          <br />
          <span>shared nearby.</span>
        </h1>
        <p className="lede">
          Weddings, parties, hotels, restaurants and homes post their surplus meals. Nearby NGOs, hostels and people in need find
          them, request them, and pick them up — before the food goes to waste.
        </p>
        <ol className="how">
          {FLOW.map(([t, d], i) => (
            <li key={t}>
              <span className="how-n">{i + 1}</span>
              <div>
                <b>{t}</b>
                <small>{d}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="auth-card" aria-label="Log in or sign up">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            Log in
          </button>
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>
            Sign up
          </button>
        </div>
        {mode === 'login' ? <LoginForm onDone={setUser} /> : <SignupForm onDone={setUser} />}
        <p className="fine center">
          <Icon name="leaf" size={14} /> Free for everyone. Food safety is the provider’s responsibility — share only food you would eat.
        </p>
      </section>
    </div>
  );
}
