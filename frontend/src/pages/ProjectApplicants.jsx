import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Api, formatTime } from '../api';
import { useToast } from '../toast';
import { ApplicationStatusBadge } from '../components/Layout';

function ApplicantCard({ app, busy, rejecting, rejectReason, onAccept, onStartReject, onCancelReject, onRejectReasonChange, onConfirmReject }) {
  return (
    <div className={`card applicant-card ${app.status === 'PENDING' ? 'is-pending' : ''}`}>
      <div className="applicant-head">
        <div>
          <strong>{app.applicant_nickname}</strong> <span className="muted">@{app.applicant_username}</span>
        </div>
        <div className="applicant-badges">
          <span className="role-chip">{app.role_name}</span>
          <ApplicationStatusBadge status={app.status} />
        </div>
      </div>

      <div className="snapshot">
        <div className="snapshot-title">申请时资料（提交时快照）</div>
        <div className="muted small">
          每周可投入 {app.profile_snapshot.weekly_hours ?? '—'} 小时
        </div>
        {Array.isArray(app.profile_snapshot.skills) && app.profile_snapshot.skills.length > 0 && (
          <div className="skill-chips small">
            {app.profile_snapshot.skills.map((s) => <span className="skill-chip" key={s}>{s}</span>)}
          </div>
        )}
        {app.profile_snapshot.bio && <p className="muted small">{app.profile_snapshot.bio}</p>}
      </div>

      <div className="app-body">
        <div><strong>申请理由：</strong>{app.reason}</div>
        <div><strong>可承担内容：</strong>{app.contribution}</div>
      </div>

      <div className="muted small">
        申请于 {formatTime(app.created_at)}
        {app.decided_at ? ` · 处理于 ${formatTime(app.decided_at)}` : ''}
      </div>
      {app.status === 'REJECTED' && app.reject_reason && (
        <div className="reject-reason">拒绝原因：{app.reject_reason}</div>
      )}

      {app.status === 'PENDING' && (
        <div className="applicant-actions">
          {app.role_is_full && (
            <span className="alert alert-warn inline">该角色名额已满，无法再接受；仍可拒绝这条申请。</span>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={app.role_is_full || busy}
            onClick={onAccept}
          >
            接受
          </button>
          {rejecting ? (
            <span className="inline-actions">
              <input
                value={rejectReason}
                placeholder="填写拒绝原因（必填）"
                onChange={(e) => onRejectReasonChange(e.target.value)}
              />
              <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={onConfirmReject}>
                确认拒绝
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelReject}>取消</button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onStartReject}>拒绝</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectApplicants() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await Api.projectApplications(id);
      setData(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async (app) => {
    setBusyId(app.id);
    try {
      await Api.accept(app.id);
      toast.success(`已接受 ${app.applicant_nickname} 的申请，成员名单已更新`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const reject = async (app) => {
    if (!rejectReason.trim()) {
      toast.error('请填写拒绝原因');
      return;
    }
    setBusyId(app.id);
    try {
      await Api.reject(app.id, rejectReason);
      toast.success('已拒绝该申请，申请人可以看到拒绝原因');
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
      await load();
    }
  };

  if (loading) return <div className="loading">加载中…</div>;
  if (error) {
    return (
      <div className="alert alert-error">
        {error} · <Link to="/my/projects">返回我的项目</Link>
      </div>
    );
  }
  if (!data) return null;

  const pending = data.applications.filter((a) => a.status === 'PENDING');
  const handled = data.applications.filter((a) => a.status !== 'PENDING');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>申请管理</h1>
          <div className="muted">
            「{data.project.title}」 · 仅发起人可见全部申请与申请人资料 ·
            当前各角色剩余名额：
            {data.project.roles.map((r) => ` ${r.name} ${r.remaining}/${r.capacity}`).join('，')}
          </div>
        </div>
        <Link className="btn btn-ghost" to={`/projects/${data.project.id}`}>返回项目详情</Link>
      </div>

      <h2 className="section-title">待审核（{pending.length}）</h2>
      {pending.length === 0 && <div className="empty">当前没有待审核的申请。</div>}
      <div className="applicant-list">
        {pending.map((app) => (
          <ApplicantCard
            key={app.id}
            app={app}
            busy={busyId === app.id}
            rejecting={rejectingId === app.id}
            rejectReason={rejectReason}
            onAccept={() => accept(app)}
            onStartReject={() => {
              setRejectingId(app.id);
              setRejectReason('');
            }}
            onCancelReject={() => {
              setRejectingId(null);
              setRejectReason('');
            }}
            onRejectReasonChange={setRejectReason}
            onConfirmReject={() => reject(app)}
          />
        ))}
      </div>

      <h2 className="section-title">已处理（{handled.length}）</h2>
      {handled.length === 0 && <div className="empty">还没有已处理的申请。</div>}
      <div className="applicant-list">
        {handled.map((app) => (
          <ApplicantCard
            key={app.id}
            app={app}
            busy={false}
            rejecting={false}
            rejectReason=""
            onAccept={() => {}}
            onStartReject={() => {}}
            onCancelReject={() => {}}
            onRejectReasonChange={() => {}}
            onConfirmReject={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
