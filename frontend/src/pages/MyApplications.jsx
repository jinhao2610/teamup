import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Api, formatTime } from '../api';
import { useToast } from '../toast';
import { ApplicationStatusBadge } from '../components/Layout';

const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING', label: '待审核' },
  { key: 'ACCEPTED', label: '已通过' },
  { key: 'REJECTED', label: '已拒绝' },
  { key: 'WITHDRAWN', label: '已撤回' },
];

export default function MyApplications() {
  const toast = useToast();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [confirmingId, setConfirmingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await Api.myApplications();
      setApps(data.applications);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const withdraw = async (id) => {
    try {
      await Api.withdraw(id);
      toast.success('申请已撤回，你可以重新申请该项目，原记录会保留');
      setConfirmingId(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const visible = filter === 'ALL' ? apps : apps.filter((a) => a.status === filter);
  const count = (key) => (key === 'ALL' ? apps.length : apps.filter((a) => a.status === key).length);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>我的申请</h1>
          <div className="muted">查看每条申请的状态和结果；待审核申请可以撤回，被拒绝或撤回后可以重新申请</div>
        </div>
      </div>

      <div className="chip-row filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip-toggle ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}（{count(f.key)}）
          </button>
        ))}
      </div>

      {loading && <div className="loading">加载中…</div>}
      {!loading && error && <div className="alert alert-error">{error}</div>}
      {!loading && !error && visible.length === 0 && (
        <div className="empty">暂无相关申请记录。去<Link to="/projects">项目广场</Link>看看正在招募的项目吧。</div>
      )}

      <div className="app-list">
        {visible.map((a) => (
          <div className="card app-card" key={a.id}>
            <div className="app-card-head">
              <div>
                <Link to={`/projects/${a.project_id}`} className="app-project-title">{a.project_title}</Link>
                <div className="muted small">申请角色：{a.role_name} · 申请于 {formatTime(a.created_at)}</div>
              </div>
              <ApplicationStatusBadge status={a.status} />
            </div>
            <div className="app-body">
              <div><strong>申请理由：</strong>{a.reason}</div>
              <div><strong>可承担内容：</strong>{a.contribution}</div>
            </div>
            {a.status === 'REJECTED' && a.reject_reason && (
              <div className="reject-reason">拒绝原因：{a.reject_reason}</div>
            )}
            {a.decided_at && <div className="muted small">处理时间：{formatTime(a.decided_at)}</div>}
            {a.status === 'PENDING' && (
              <div className="inline-actions">
                {confirmingId === a.id ? (
                  <>
                    <span className="muted small">确认撤回这条申请？</span>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => withdraw(a.id)}>确认撤回</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingId(null)}>取消</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingId(a.id)}>撤回申请</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
