import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../api';
import { useToast } from '../toast';
import { ProjectStatusBadge } from '../components/Layout';

export default function MyProjects() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await Api.myProjects();
      setProjects(data.projects);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (project) => {
    const next = project.status === 'PAUSED' ? 'RECRUITING' : 'PAUSED';
    setBusyId(project.id);
    try {
      const data = await Api.setProjectStatus(project.id, next);
      setProjects((list) => list.map((p) => (p.id === data.project.id ? data.project : p)));
      toast.success(next === 'PAUSED' ? `「${project.title}」已暂停招募` : `「${project.title}」已恢复招募`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>我的项目</h1>
          <div className="muted">管理你发起的项目：查看申请、暂停或恢复招募</div>
        </div>
        <Link className="btn btn-primary" to="/projects/new">发布项目</Link>
      </div>

      {loading && <div className="loading">加载中…</div>}
      {!loading && error && <div className="alert alert-error">{error}</div>}
      {!loading && !error && projects.length === 0 && (
        <div className="empty">你还没有发布项目，点击右上角「发布项目」创建第一个吧。</div>
      )}

      <div className="grid project-grid">
        {projects.map((p) => (
          <div className="card project-card" key={p.id}>
            <div className="project-card-head">
              <h3><Link to={`/projects/${p.id}`}>{p.title}</Link></h3>
              <ProjectStatusBadge status={p.display_status} />
            </div>
            <div className="role-chips">
              {p.roles.map((r) => (
                <span key={r.id} className={`role-chip ${r.is_full ? 'full' : ''}`}>
                  {r.name} · {r.is_full ? '已满' : `剩 ${r.remaining}/${r.capacity}`}
                </span>
              ))}
            </div>
            <div className="card-foot">
              <span className="muted">成员 {p.members.length} 人</span>
              <span className={p.pending_application_count > 0 ? 'pending-note' : 'muted'}>
                {p.pending_application_count > 0 ? `${p.pending_application_count} 条待审核申请` : '暂无待审核申请'}
              </span>
            </div>
            <div className="inline-actions">
              <Link className="btn btn-primary btn-sm" to={`/projects/${p.id}/applicants`}>管理申请</Link>
              <Link className="btn btn-ghost btn-sm" to={`/projects/${p.id}`}>查看详情</Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busyId === p.id}
                onClick={() => toggleStatus(p)}
              >
                {p.status === 'PAUSED' ? '恢复招募' : '暂停招募'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
