import { useEffect, useState } from 'react';
import { Api, formatTime } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ nickname: '', bio: '', skillsText: '', weekly_hours: 5 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setForm({
        nickname: user.nickname || '',
        bio: user.bio || '',
        skillsText: (user.skills || []).join(', '),
        weekly_hours: user.weekly_hours || 0,
      });
    }
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const skills = form.skillsText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    if (!form.nickname.trim()) {
      setError('昵称不能为空');
      return;
    }
    if (skills.length === 0) {
      setError('请至少填写一个技能标签');
      return;
    }
    const hours = Number(form.weekly_hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      setError('每周可投入时间需为 1-168 之间的小时数');
      return;
    }
    setSaving(true);
    try {
      const data = await Api.updateProfile({
        nickname: form.nickname,
        bio: form.bio,
        skills,
        weekly_hours: hours,
      });
      setUser(data.user);
      toast.success('个人资料已保存');
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const skillsPreview = form.skillsText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>个人资料</h1>
          <div className="muted">
            账号 @{user?.username} · 注册于 {formatTime(user?.created_at)} · 申请加入项目时会把当前资料作为快照提交给发起人
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="card section profile-form">
        <div className="field">
          <label>昵称 *</label>
          <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        </div>
        <div className="field">
          <label>简介</label>
          <textarea
            rows={3}
            value={form.bio}
            placeholder="简单介绍你的背景和兴趣"
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </div>
        <div className="field">
          <label>技能标签（逗号分隔，至少一个）*</label>
          <input
            value={form.skillsText}
            placeholder="例如：React, JavaScript, CSS"
            onChange={(e) => setForm({ ...form, skillsText: e.target.value })}
          />
          {skillsPreview.length > 0 && (
            <div className="skill-chips small">
              {skillsPreview.map((s) => <span className="skill-chip" key={s}>{s}</span>)}
            </div>
          )}
        </div>
        <div className="field">
          <label>每周可投入时间（小时）*</label>
          <input
            type="number"
            min={1}
            max={168}
            value={form.weekly_hours}
            onChange={(e) => setForm({ ...form, weekly_hours: e.target.value })}
          />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? '保存中…' : '保存资料'}
          </button>
        </div>
      </form>
    </div>
  );
}
