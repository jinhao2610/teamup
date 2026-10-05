import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Api, formatTime } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { ApplicationStatusBadge, ProjectStatusBadge } from '../components/Layout';

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ role_id: '', reason: '', contribution: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await Api.project(id);
      setProject(data.project);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="loading">加载中…</div>;
  if (error) {
    return (
      <div className="alert alert-error">
        {error} · <Link to="/projects">返回项目广场</Link>
      </div>
    );
  }
  if (!project) return null;

  const myMembership = project.members.find((m) => m.user_id === user.id);
  const myApplications = project.my_applications || [];
  const myPending = myApplications.find((a) => a.status === 'PENDING');
  const myAccepted = myApplications.find((a) => a.status === 'ACCEPTED');
  const roleName = (roleId) => project.roles.find((r) => r.id === roleId)?.name || '—';
  const allFull = project.display_status === 'FULL';
  const hasHistory = myApplications.some((a) => a.status === 'REJECTED' || a.status === 'WITHDRAWN');
  const joinedMembers = project.roles.flatMap((r) => r.members.map((m) => ({ ...m, roleName: r.name })));

  const submitApply = async (e) => {
    e.preventDefault();
    if (!form.role_id) {
      toast.error('请选择要申请的角色');
      return;
    }
    if (!form.reason.trim()) {
      toast.error('请填写申请理由');
      return;
    }
    if (!form.contribution.trim()) {
      toast.error('请填写可承担的内容');
      return;
    }
    setSubmitting(true);
    try {
      await Api.apply(project.id, {
        role_id: Number(form.role_id),
        reason: form.reason,
        contribution: form.contribution,
      });
      toast.success('申请已提交，等待发起人审核');
      setForm({ role_id: '', reason: '', contribution: '' });
      await load();
    } catch (err) {
      toast.error(err.message);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    try {
      await Api.withdraw(myPending.id);
      toast.success('申请已撤回，可在需要时重新申请');
      setConfirmWithdraw(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleStatus = async () => {
    const next = project.status === 'PAUSED' ? 'RECRUITING' : 'PAUSED';
    try {
      const data = await Api.setProjectStatus(project.id, next);
      setProject(data.project);
      toast.success(next === 'PAUSED' ? '已暂停招募' : '已恢复招募');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="detail">
      <div className="page-head">
        <div>
          <h1>{project.title}</h1>
          <div className="muted">
            发起人：{project.owner.nickname}（@{project.owner.username}） · 发布于 {formatTime(project.created_at)}
          </div>
        </div>
        <ProjectStatusBadge status={project.display_status} />
      </div>

      <section className="card section">
        <div className="info-grid">
          <div className="info-block"><h3>项目介绍</h3><p>{project.intro}</p></div>
          <div className="info-block"><h3>项目目标</h3><p>{project.goal}</p></div>
          <div className="info-block"><h3>当前进展</h3><p>{project.progress}</p></div>
          <div className="info-block"><h3>预期成果</h3><p>{project.expected_outcome}</p></div>
        </div>
      </section>

      <section className="card section">
        <h2>发起人资料</h2>
        <div className="owner-profile">
          <div className="avatar">{project.owner.nickname.slice(0, 1)}</div>
          <div>
            <div className="member-name">{project.owner.nickname} <span className="muted">@{project.owner.username}</span></div>
            {project.owner.bio && <p className="muted">{project.owner.bio}</p>}
            <div className="skill-chips small">
              {project.owner.skills.map((s) => <span className="skill-chip" key={s}>{s}</span>)}
            </div>
            <div className="muted small">每周可投入 {project.owner.weekly_hours} 小时</div>
          </div>
        </div>
      </section>

      <section className="card section">
        <h2>招募角色</h2>
        <div className="role-list">
          {project.roles.map((r) => (
            <div className="role-item" key={r.id}>
              <div className="role-item-head">
                <strong>{r.name}</strong>
                <span className={r.is_full ? 'badge badge-full' : 'badge badge-recruiting'}>
                  {r.is_full ? '名额已满' : `剩余 ${r.remaining} / 共 ${r.capacity} 个名额`}
                </span>
              </div>
              <div className="muted">技能要求：{r.skill_requirement}</div>
              {r.skills.length > 0 && (
                <div className="skill-chips small">
                  {r.skills.map((s) => <span className="skill-chip" key={s}>{s}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card section">
        <h2>成员名单（{project.members.length} 人）</h2>
        <div className="member-grid">
          <div className="member-card">
            <div className="avatar">{project.owner.nickname.slice(0, 1)}</div>
            <div>
              <div className="member-name">
                {project.owner.nickname} <span className="badge badge-owner">发起人</span>
              </div>
              <div className="muted small">不占招募名额</div>
            </div>
          </div>
          {joinedMembers.map((m) => (
            <div className="member-card" key={`${m.roleName}-${m.user_id}`}>
              <div className="avatar">{m.nickname.slice(0, 1)}</div>
              <div>
                <div className="member-name">{m.nickname} <span className="muted small">@{m.username}</span></div>
                <div className="muted small">角色：{m.roleName} · 加入于 {formatTime(m.joined_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {project.is_owner ? (
        <section className="card section owner-panel">
          <h2>发起人操作</h2>
          <div className="owner-actions">
            <Link className="btn btn-primary" to={`/projects/${project.id}/applicants`}>
              管理申请
              {project.pending_application_count > 0 ? `（${project.pending_application_count} 条待审核）` : ''}
            </Link>
            <button type="button" className="btn btn-ghost" onClick={toggleStatus}>
              {project.status === 'PAUSED' ? '恢复招募' : '暂停招募'}
            </button>
          </div>
          <p className="muted small">暂停后不再接收新申请；已有待审核申请仍可继续审核。</p>
        </section>
      ) : (
        <section className="card section">
          <h2>申请加入</h2>

          {myMembership && !myMembership.is_owner ? (
            <div className="alert alert-success">
              你已加入本项目{myMembership.role_id ? `，角色：${roleName(myMembership.role_id)}` : ''}。
            </div>
          ) : myPending ? (
            <div className="alert alert-info">
              你的申请正在等待发起人审核（角色：{roleName(myPending.role_id)}）。
              {confirmWithdraw ? (
                <span className="inline-actions">
                  <button type="button" className="btn btn-danger btn-sm" onClick={withdraw}>确认撤回</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmWithdraw(false)}>取消</button>
                </span>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmWithdraw(true)}>撤回申请</button>
              )}
            </div>
          ) : project.status === 'PAUSED' ? (
            <div className="alert alert-warn">项目已暂停招募，暂不能提交申请。已有待审核申请仍可被审核。</div>
          ) : allFull ? (
            <div className="alert alert-warn">所有角色均已招满，招募已满，暂不能提交申请。</div>
          ) : (
            <form onSubmit={submitApply} className="apply-form">
              {hasHistory && (
                <div className="alert alert-info">
                  你之前申请过本项目（已拒绝或已撤回），可以重新申请；原申请记录会保留。
                </div>
              )}
              <div className="field">
                <label>选择角色</label>
                <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                  <option value="">请选择要申请的角色</option>
                  {project.roles.map((r) => (
                    <option key={r.id} value={r.id} disabled={r.is_full}>
                      {r.name}（{r.is_full ? '已满' : `剩余 ${r.remaining} 个名额`}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>申请理由</label>
                <textarea
                  rows={3}
                  value={form.reason}
                  placeholder="说明你为什么想加入、有哪些相关经验"
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </div>
              <div className="field">
                <label>可承担的内容</label>
                <textarea
                  rows={3}
                  value={form.contribution}
                  placeholder="说明你能负责哪些工作、每周可投入多少时间"
                  onChange={(e) => setForm({ ...form, contribution: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? '提交中…' : '提交申请'}
              </button>
            </form>
          )}

          {myApplications.length > 0 && (
            <div className="app-history">
              <h3>我的申请记录</h3>
              {myApplications.map((a) => (
                <div className="history-row" key={a.id}>
                  <ApplicationStatusBadge status={a.status} />
                  <span>角色：{roleName(a.role_id)}</span>
                  <span className="muted">申请于 {formatTime(a.created_at)}</span>
                  {a.reject_reason && <span className="reject-reason">拒绝原因：{a.reject_reason}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
