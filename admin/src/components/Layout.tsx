import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { rpc } from '../lib/rpc';

const ROLE_LABEL = { super_admin: 'Super admin', tournament_manager: 'Tournament manager', moderator: 'Moderator' } as const;

export function Layout() {
  const { role, signOut } = useAuth();
  const isSuper = role === 'super_admin';
  const isModerator = role === 'moderator';
  const canReview = isSuper || isModerator;
  const location = useLocation();
  const [openReports, setOpenReports] = useState(0);

  // Open-reports badge: refreshed on every navigation (cheap RPC, staff only).
  useEffect(() => {
    if (!canReview) return;
    rpc.reportStats().then((s) => setOpenReports(Number(s?.open_count ?? 0))).catch(() => undefined);
  }, [canReview, location.pathname]);
  return (
    <div className="shell">
      <header className="topbar">
        <strong className="brand">Sportron Admin</strong>
        <nav>
          {!isModerator && (
            <NavLink to="/" end>
              Overview
            </NavLink>
          )}
          {!isModerator && <NavLink to="/tournaments">Tournaments</NavLink>}
          {canReview && (
            <NavLink to="/reports">
              Reports{openReports > 0 && <span className="nav-badge">{openReports > 99 ? '99+' : openReports}</span>}
            </NavLink>
          )}
          {isSuper && <NavLink to="/announcements">Announcements</NavLink>}
          {isSuper && <NavLink to="/broadcasts">Broadcasts</NavLink>}
          {isSuper && <NavLink to="/config">Flags &amp; config</NavLink>}
          {isSuper && <NavLink to="/settings">Settings</NavLink>}
          {isSuper && <NavLink to="/staff">Staff</NavLink>}
        </nav>
        <div className="spacer" />
        <span className="chip">{role ? ROLE_LABEL[role] : ''}</span>
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
