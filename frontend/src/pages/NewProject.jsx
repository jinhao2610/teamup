import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { useToast } from '../toast';

const NEW_ROLE = { name: '', skill_requirement: '', skillsText: '', capacity: 1 };

export default function NewProject() {
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', intro: '', goal: '', progress: '', expected_outcome: '' });
  const [roles, setRoles] = useState([{ ...NEW_ROLE }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setRoleField = (index, key, value) =>
    setRoles((list) => list.map((r, i) => (i === index ? { ...r, [key]: value } : r)));

  const addRole = () => {
    if (roles.length >= 10) {
      toast.error('最多添加 10 种招募角色');
      return;
    }
    setRoles((list) => [...list, { ...NEW_ROLE }]);
  };

  const removeRole = (index) => {
    if (roles.length <= 1) {
      toast.error('至少保留一种招募角色');
      return;
    }
    setRoles((list) => list.filter((_, i) => i !== index));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.intro.trim() || !form.goal.trim() || !form.progress.trim() || !form.expected_outcome.trim()) {
      setError('请填写完整的项目信息（标题、介绍、目标、当前进展、预期成果）');
      return;
    }
    for (const r of roles) {
      if (!r.name.trim() || !r.skill_requirement.trim()) {
        setError('每个招募角色都需要填写角色名称和技能要求');
        return;
      }
      if (!Number.isInteger(Number(r.capacity)) || Number(r.capacity) < 1) {
        setError(`角色「${r.name}」的人数上限需为不小于 1 的整数`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        roles: roles.map((r) => ({
          name: r.name,
          skill_requirement: r.skill_requirement,
          skills: r.skillsText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          capacity: Number(r.capacity),
        })),
      };
      const data = await Api.createProject(payload);
      toast.success('项目发布成功');
      navigate(`/projects/${data.project.id}`);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>发布新项目</h1>
          <div className="muted">填写项目信息并设置至少一种招募角色，发布后你将自动成为项目成员（不占招募名额）</div>
        </div>
      </div>

      <form onSubmit={submit} className="card section">
        <div className="field">
          <label>项目标题 *</label>
          <input value={form.title} placeholder="例如：校园二手交易平台" onChange={(e) => setField('title', e.target.value)} />
        </div>
        <div className="field">
          <label>项目介绍 *</label>
          <textarea rows={2} value={form.intro} placeholder="一句话说明项目在做什么" onChange={(e) => setField('intro', e.target.value)} />
        </div>
        <div className="field">
          <label>项目目标 *</label>
          <textarea rows={2} value={form.goal} placeholder="希望达成什么目标" onChange={(e) => setField('goal', e.target.value)} />
        </div>
        <div className="field">
          <label>当前进展 *</label>
          <textarea rows={2} value={form.progress} placeholder="目前做到哪一步了" onChange={(e) => setField('progress', e.target.value)} />
        </div>
        <div className="field">
          <label>预期成果 *</label>
          <textarea rows={2} value={form.expected_outcome} placeholder="最终会交付什么" onChange={(e) => setField('expected_outcome', e.target.value)} />
        </div>

        <h2 className="section-title">招募角色（至少 1 种）</h2>
        {roles.map((r, index) => (
          <div className="role-editor" key={index}>
            <div className="role-editor-head">
              <strong>角色 {index + 1}</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRole(index)}>删除</button>
            </div>
            <div className="filter-row">
              <div className="field grow">
                <label>角色名称 *</label>
                <input value={r.name} placeholder="例如：前端开发" onChange={(e) => setRoleField(index, 'name', e.target.value)} />
              </div>
              <div className="field">
                <label>人数上限 *</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={r.capacity}
                  onChange={(e) => setRoleField(index, 'capacity', e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>技能要求 *</label>
              <input
                value={r.skill_requirement}
                placeholder="例如：熟悉基础 Web 开发，能独立完成页面"
                onChange={(e) => setRoleField(index, 'skill_requirement', e.target.value)}
              />
            </div>
            <div className="field">
              <label>技能标签（用于筛选，逗号分隔）</label>
              <input
                value={r.skillsText}
                placeholder="例如：React, JavaScript"
                onChange={(e) => setRoleField(index, 'skillsText', e.target.value)}
              />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={addRole}>+ 添加角色</button>

        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '发布中…' : '发布项目'}
          </button>
        </div>
      </form>
    </div>
  );
}
