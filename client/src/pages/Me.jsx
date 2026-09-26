import { Link } from 'react-router';
import { confirmReset } from '../api.js';
import { Avatar, Icon } from '../components/ui.jsx';
import { useAuth, useTheme } from '../state.jsx';
import { ACCOUNT_LABEL } from '../util.js';

const LINKS = [
  ['/my-posts', 'My posts', 'list', 'Active, requested, claimed and completed posts'],
  ['/requests', 'My requests', 'inbox', 'Food you asked for and pickup codes'],
  ['/impact', 'Impact', 'chart', 'Meals redistributed and waste avoided'],
  ['/settings', 'Settings', 'settings', 'Profile, location and alert radius'],
];

/** Profile hub, linked from the navbar's account menu. */
export default function Me() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="page narrow">
      <div className="profile">
        <Avatar name={user.name} size={60} />
        <div>
          <h1>{user.name}</h1>
          <p className="muted">
            {ACCOUNT_LABEL[user.account_type]}
            {user.locality && ` · ${user.locality}`}
          </p>
        </div>
      </div>
      <nav className="hub">
        {LINKS.map(([to, label, icon, sub]) => (
          <Link key={to} to={to} className="hub-link">
            <span className="hub-icon">
              <Icon name={icon} />
            </span>
            <span className="grow">
              <b>{label}</b>
              <small>{sub}</small>
            </span>
            <Icon name="chevron" className="muted" />
          </Link>
        ))}
        <button className="hub-link" onClick={toggleTheme}>
          <span className="hub-icon">
            <Icon name={theme === 'light' ? 'moon' : 'sun'} />
          </span>
          <span className="grow">
            <b>{theme === 'light' ? 'Switch to Black Theme' : 'Switch to Light Theme'}</b>
            <small>Currently in {theme === 'light' ? 'Light' : 'Black / Dark'} mode</small>
          </span>
        </button>
        <button className="hub-link" onClick={confirmReset}>
          <span className="hub-icon">
            <Icon name="trash" />
          </span>
          <span className="grow">
            <b>Reset demo data</b>
            <small>Start again with fresh demo posts; deletes everything saved in this browser</small>
          </span>
        </button>
        <button className="hub-link" onClick={logout}>
          <span className="hub-icon">
            <Icon name="logout" />
          </span>
          <span className="grow">
            <b>Log out</b>
          </span>
        </button>
      </nav>
    </div>
  );
}
