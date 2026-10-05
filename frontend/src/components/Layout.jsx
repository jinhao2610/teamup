import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { APPLICATION_STATUS_LABELS, PROJECT_STATUS_LABELS } from '../api';

// 通用状态徽章（供各页面复用）
export function ProjectStatusBadge({ status }) {
  const cls = { RECRUITING: 'badge-recruiting', PAUSED: 'badge-paused', FULL: 'badge-full' }[status] || '';
  return <span className={`badge ${cls}`}>{PROJECT_STATUS_LABELS[status] || status}</span>;
}

export function ApplicationStatusBadge({ status }) {
  const cls = { PENDING: 'badge-pending', ACCEPTED: 'badge-accepted', REJECTED: 'badge-rejected', WITHDRAWN: 'badge-withdrawn' }[status] || '';
  return <span className={`badge ${cls}`}>{APPLICATION_STATUS_LABELS[status] || status}</span>;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.info('已退出登录');
    navigate('/login');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">🤝 TeamUp 组队平台</div>
          <nav className="nav">
            <NavLink to="/projects" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>项目广场</NavLink>
            <NavLink to="/projects/new" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>发布项目</NavLink>
            <NavLink to="/my/projects" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>我的项目</NavLink>
            <NavLink to="/my/applications" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>我的申请</NavLink>
            <NavLink to="/profile" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>个人资料</NavLink>
          </nav>
          <div className="user-area">
            <span className="user-chip">
              {user?.nickname}
              <span className="user-chip-username">@{user?.username}</span>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>退出</button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
      <footer className="footer">TeamUp · 项目组队与成员招募平台 · 数据保存在本地 SQLite</footer>
    </div>
  );
}
