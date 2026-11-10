import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function Layout() {
  const { role, signOut } = useAuth();
  const isSuper = role === 'super_admin';
  return (
    <div className="shell">
      <header className="topbar">
        <strong className="brand">Sportron Admin</strong>
        <nav>
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/tournaments">Tournaments</NavLink>
          {isSuper && <NavLink to="/settings">Settings</NavLink>}
          {isSuper && <NavLink to="/staff">Staff</NavLink>}
        </nav>
        <div className="spacer" />
        <span className="chip">{role === 'super_admin' ? 'Super admin' : 'Tournament manager'}</span>
        <button className="btn" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
