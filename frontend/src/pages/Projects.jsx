import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../api';
import { ProjectStatusBadge } from '../components/Layout';

const EMPTY_FILTERS = { q: '', role: '', status: '', skills: [] };

export default function Projects() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [skillOptions, setSkillOptions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Api.skills()
      .then((d) => setSkillOptions(d.skills))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (filters.q.trim()) params.q = filters.q.trim();
        if (filters.role.trim()) params.role = filters.role.trim();
        if (filters.skills.length) params.skills = filters.skills.join(',');
        if (filters.status) params.status = filters.status;
        const data = await Api.projects(params);
        if (!cancelled) setProjects(data.projects);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters]);

  const toggleSkill = (skill) => {
    setFilters((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }));
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>项目广场</h1>
          <div className="muted">浏览正在招募的项目，按关键词、角色、技能和招募状态筛选</div>
        </div>
        <Link className="btn btn-primary" to="/projects/new">发布项目</Link>
      </div>

      <div className="card filters">
        <div className="filter-row">
          <div className="field grow">
            <label>关键词（标题 / 介绍 / 目标）</label>
            <input
              value={filters.q}
              placeholder="例如：二手交易"
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>招募角色</label>
            <input
              value={filters.role}
              placeholder="例如：前端"
              onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>招募状态</label>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">全部状态</option>
              <option value="RECRUITING">招募中</option>
              <option value="PAUSED">已暂停</option>
              <option value="FULL">已满员</option>
            </select>
          </div>
        </div>
        {skillOptions.length > 0 && (
          <div className="filter-skills">
            <span className="muted">技能标签（多选，需全部包含）：</span>
            <div className="chip-row">
              {skillOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip-toggle ${filters.skills.includes(s) ? 'active' : ''}`}
                  onClick={() => toggleSkill(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="filter-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters(EMPTY_FILTERS)}>重置筛选</button>
        </div>
      </div>

      {loading && <div className="loading">加载中…</div>}
      {!loading && error && <div className="alert alert-error">{error}</div>}
      {!loading && !error && projects.length === 0 && (
        <div className="empty">没有找到符合条件的项目，试试调整筛选条件。</div>
      )}

      <div className="grid project-grid">
        {projects.map((p) => (
          <Link className="card project-card" key={p.id} to={`/projects/${p.id}`}>
            <div className="project-card-head">
              <h3>{p.title}</h3>
              <ProjectStatusBadge status={p.display_status} />
            </div>
            <p className="muted clamp-2">{p.intro}</p>
            <div className="role-chips">
              {p.roles.map((r) => (
                <span key={r.id} className={`role-chip ${r.is_full ? 'full' : ''}`}>
                  {r.name} · {r.is_full ? '已满' : `剩 ${r.remaining}/${r.capacity}`}
                </span>
              ))}
            </div>
            <div className="card-foot">
              <span className="muted">发起人：{p.owner.nickname}（@{p.owner.username}）</span>
              <span className="muted">成员 {p.members.length} 人</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
