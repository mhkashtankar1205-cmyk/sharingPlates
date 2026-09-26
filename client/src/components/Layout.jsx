import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth, useLive } from '../state.jsx';
import { ACCOUNT_LABEL } from '../util.js';
import { Avatar, Icon, ThemeToggle } from './ui.jsx';

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="sharingPlates home">
      sharing<span>Plates</span>
    </Link>
  );
}

const MAIN_NAV = [
  ['/', 'Home', 'home'],
  ['/nearby', 'Nearby', 'nearby'],
  ['/alerts', 'Notifications', 'bell'],
  ['/my-posts', 'My posts', 'list'],
  ['/requests', 'My requests', 'inbox'],
  ['/impact', 'Impact', 'chart'],
  ['/settings', 'Settings', 'settings'],
];

// On wide screens Notifications and Settings live behind the bell and the account menu.
const BAR_NAV = MAIN_NAV.filter(([to]) => to !== '/alerts' && to !== '/settings');

const FOOTER_NAV = [
  ['Explore', [['/', 'Home feed'], ['/nearby', 'Nearby food'], ['/post', 'Share food'], ['/impact', 'Impact']]],
  ['Your account', [['/my-posts', 'My posts'], ['/requests', 'My requests'], ['/alerts', 'Notifications'], ['/settings', 'Settings']]],
];

function Badge({ n }) {
  return n > 0 ? <span className="badge">{n > 99 ? '99+' : n}</span> : null;
}

/** Closes an open popup when the user presses outside it or hits Escape. */
function useDismiss(ref, open, setOpen) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, setOpen]);
}

// Close a popup once one of its links or buttons has been picked.
const closeOnPick = (setOpen) => (e) => {
  if (e.target.closest('a, button')) setOpen(false);
};

function Toasts() {
  const { toasts, dismiss } = useLive();
  const navigate = useNavigate();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone || ''}`}>
          <span className="grow">{t.message}</span>
          {t.to && (
            <button
              className="link"
              onClick={() => {
                dismiss(t.id);
                navigate(t.to);
              }}
            >
              View
            </button>
          )}
          <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, setOpen);

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-btn"
        aria-expanded={open}
        aria-controls="user-menu"
        aria-label="Account menu"
        title={user.name}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={user.name} size={36} />
      </button>
      {open && (
        <div id="user-menu" className="dropdown" onClick={closeOnPick(setOpen)}>
          <div className="dropdown-head">
            <b>{user.name}</b>
            <small>{ACCOUNT_LABEL[user.account_type]}</small>
            <small>
              <Icon name="pin" size={12} /> {user.locality || 'Location not set'} · {user.radius_km} km
            </small>
          </div>
          <NavLink to="/me" className="menu-item">
            <Icon name="user" size={18} />
            <span>Profile</span>
          </NavLink>
          <NavLink to="/settings" className="menu-item">
            <Icon name="settings" size={18} />
            <span>Settings</span>
          </NavLink>
          <button type="button" className="menu-item" onClick={logout}>
            <Icon name="logout" size={18} />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>Share extra food from weddings, parties, hotels and homes with nearby NGOs, hostels and people before it goes to waste.</p>
        </div>
        {FOOTER_NAV.map(([title, links]) => (
          <nav key={title} className="footer-col" aria-label={title}>
            <h2>{title}</h2>
            {links.map(([to, label]) => (
              <Link key={to} to={to}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} sharingPlates</span>
        <span>Surplus food, shared nearby.</span>
      </div>
    </footer>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { unread } = useLive();
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef(null);
  useDismiss(barRef, menuOpen, setMenuOpen);

  return (
    <div className="shell">
      <header className="navbar" ref={barRef}>
        <div className="navbar-inner">
          <Logo />
          <nav className="nav-links" aria-label="Main">
            {BAR_NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className="nav-link">
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="nav-actions">
            <Link to="/post" className="btn sm nav-share" aria-label="Share food">
              <Icon name="plus" size={16} />
              <span>Share food</span>
            </Link>
            <NavLink to="/alerts" className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} title="Notifications">
              <Icon name="bell" />
              <Badge n={unread} />
            </NavLink>
            <ThemeToggle />
            <UserMenu user={user} logout={logout} />
            <button
              type="button"
              className="icon-btn nav-burger"
              aria-expanded={menuOpen}
              aria-controls="nav-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav id="nav-menu" className="nav-menu" aria-label="Menu" onClick={closeOnPick(setMenuOpen)}>
            {MAIN_NAV.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === '/'} className="menu-item">
                <Icon name={icon} size={18} />
                <span>{label}</span>
                {to === '/alerts' && <Badge n={unread} />}
              </NavLink>
            ))}
            <div className="nav-menu-user">
              <Link to="/me" className="nav-menu-profile">
                <Avatar name={user.name} size={36} />
                <span className="grow">
                  <b>{user.name}</b>
                  <small>
                    {ACCOUNT_LABEL[user.account_type]}
                    {user.locality && ` · ${user.locality}`}
                  </small>
                </span>
              </Link>
              <button type="button" className="icon-btn" onClick={logout} aria-label="Log out" title="Log out">
                <Icon name="logout" size={20} />
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="main" id="main">
        <Outlet />
      </main>

      <Footer />
      <Toasts />
    </div>
  );
}
