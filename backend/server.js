'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { db, DB_PATH, hashPassword, verifyPassword } = require('./db');
const { seedIfEmpty } = require('./seed');

const PORT = Number(process.env.PORT || 3001);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function wrap(handler) {
  return (req, res, next) => {
    try {
      handler(req, res, next);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error('[server] 未处理错误:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
  };
}

const nowIso = () => new Date().toISOString();

const STATUS_LABELS = { PENDING: '待审核', ACCEPTED: '已通过', REJECTED: '已拒绝', WITHDRAWN: '已撤回' };

function parseJsonArray(text) {
  try {
    const v = JSON.parse(text || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseSnapshot(text) {
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function cleanText(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanSkills(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const s = String(item == null ? '' : item).trim().slice(0, 40);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 30) break;
  }
  return out;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    bio: row.bio,
    skills: parseJsonArray(row.skills),
    weekly_hours: row.weekly_hours,
    created_at: row.created_at,
  };
}

function serializeApplication(row) {
  return {
    id: row.id,
    project_id: row.project_id,
    role_id: row.role_id,
    applicant_id: row.applicant_id,
    reason: row.reason,
    contribution: row.contribution,
    status: row.status,
    reject_reason: row.reject_reason || null,
    created_at: row.created_at,
    decided_at: row.decided_at || null,
    profile_snapshot: parseSnapshot(row.profile_snapshot),
  };
}

// ---------------------------------------------------------------------------
// 组装项目详情（名额 = 该角色成员数；发起人不占名额）
// ---------------------------------------------------------------------------
function buildProject(id, currentUserId) {
  const p = db.prepare(
    `SELECT p.*,
            u.username AS owner_username, u.nickname AS owner_nickname,
            u.bio AS owner_bio, u.skills AS owner_skills, u.weekly_hours AS owner_weekly_hours
     FROM projects p JOIN users u ON u.id = p.owner_id
     WHERE p.id = ?`
  ).get(id);
  if (!p) return null;

  const roleRows = db.prepare('SELECT * FROM roles WHERE project_id = ? ORDER BY id').all(id);
  const memberRows = db.prepare(
    `SELECT m.id, m.role_id, m.user_id, m.is_owner, m.joined_at, u.username, u.nickname
     FROM members m JOIN users u ON u.id = m.user_id
     WHERE m.project_id = ?
     ORDER BY m.is_owner DESC, m.id ASC`
  ).all(id);

  const roles = roleRows.map((r) => {
    const roleMembers = memberRows.filter((m) => m.role_id === r.id);
    const filled = roleMembers.length;
    const remaining = Math.max(0, r.capacity - filled);
    return {
      id: r.id,
      project_id: r.project_id,
      name: r.name,
      skill_requirement: r.skill_requirement,
      skills: parseJsonArray(r.skills),
      capacity: r.capacity,
      filled,
      remaining,
      is_full: remaining === 0,
      members: roleMembers.map((m) => ({ user_id: m.user_id, username: m.username, nickname: m.nickname, joined_at: m.joined_at })),
    };
  });

  const allFull = roles.length > 0 && roles.every((r) => r.is_full);
  const displayStatus = p.status === 'PAUSED' ? 'PAUSED' : allFull ? 'FULL' : 'RECRUITING';

  const dto = {
    id: p.id,
    title: p.title,
    intro: p.intro,
    goal: p.goal,
    progress: p.progress,
    expected_outcome: p.expected_outcome,
    status: p.status,
    display_status: displayStatus,
    created_at: p.created_at,
    owner_id: p.owner_id,
    owner: {
      id: p.owner_id,
      username: p.owner_username,
      nickname: p.owner_nickname,
      bio: p.owner_bio,
      skills: parseJsonArray(p.owner_skills),
      weekly_hours: p.owner_weekly_hours,
    },
    roles,
    members: memberRows.map((m) => ({
      user_id: m.user_id,
      username: m.username,
      nickname: m.nickname,
      role_id: m.role_id,
      is_owner: !!m.is_owner,
      joined_at: m.joined_at,
    })),
    pending_application_count: db.prepare(
      "SELECT COUNT(*) AS c FROM applications WHERE project_id = ? AND status = 'PENDING'"
    ).get(id).c,
  };

  if (currentUserId) {
    dto.is_owner = p.owner_id === currentUserId;
    dto.my_applications = db.prepare(
      'SELECT * FROM applications WHERE project_id = ? AND applicant_id = ? ORDER BY id DESC'
    ).all(id, currentUserId).map(serializeApplication);
  } else {
    dto.is_owner = false;
    dto.my_applications = [];
  }
  return dto;
}

// ---------------------------------------------------------------------------
// 鉴权中间件
// ---------------------------------------------------------------------------
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: '未登录，请先登录' });
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: '登录已失效，请重新登录' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  req.user = user;
  req.token = token;
  next();
}

// ---------------------------------------------------------------------------
// 基础 / 认证
// ---------------------------------------------------------------------------
app.get('/api/health', wrap((req, res) => {
  res.json({ ok: true, db: DB_PATH, time: nowIso() });
}));

app.post('/api/auth/login', wrap((req, res) => {
  const username = cleanText(req.body.username, 60).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, '用户名或密码错误');
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, nowIso());
  res.json({ token, user: publicUser(user) });
}));

app.post('/api/auth/logout', requireAuth, wrap((req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
}));

app.get('/api/auth/me', requireAuth, wrap((req, res) => {
  res.json({ user: publicUser(req.user) });
}));

app.put('/api/me', requireAuth, wrap((req, res) => {
  const nickname = cleanText(req.body.nickname, 40);
  const bio = cleanText(req.body.bio, 500);
  const skills = cleanSkills(req.body.skills);
  const weekly = Math.round(Number(req.body.weekly_hours));
  if (!nickname) throw new HttpError(400, '昵称不能为空');
  if (!Number.isFinite(weekly) || weekly < 1 || weekly > 168) throw new HttpError(400, '每周可投入时间需为 1-168 之间的小时数');
  if (skills.length === 0) throw new HttpError(400, '请至少填写一个技能标签');
  db.prepare('UPDATE users SET nickname = ?, bio = ?, skills = ?, weekly_hours = ? WHERE id = ?')
    .run(nickname, bio, JSON.stringify(skills), weekly, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
}));

// 用于筛选器的技能标签选项（所有招募角色技能的去重集合）
app.get('/api/meta/skills', requireAuth, wrap((req, res) => {
  const rows = db.prepare('SELECT skills FROM roles').all();
  const set = new Set();
  for (const row of rows) for (const s of parseJsonArray(row.skills)) set.add(s);
  res.json({ skills: Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN')) });
}));

// ---------------------------------------------------------------------------
// 项目
// ---------------------------------------------------------------------------
// 注意：/api/projects/mine 必须在 /api/projects/:id 之前注册
app.get('/api/projects/mine', requireAuth, wrap((req, res) => {
  const rows = db.prepare('SELECT id FROM projects WHERE owner_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ projects: rows.map((r) => buildProject(r.id, req.user.id)) });
}));

app.get('/api/projects', requireAuth, wrap((req, res) => {
  const q = cleanText(req.query.q, 80).toLowerCase();
  const roleFilter = cleanText(req.query.role, 60).toLowerCase();
  const statusFilter = cleanText(req.query.status, 20).toUpperCase();
  const skills = String(req.query.skills || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let list = db.prepare('SELECT id FROM projects ORDER BY id DESC').all()
    .map((r) => buildProject(r.id, req.user.id));

  if (q) {
    list = list.filter((p) =>
      [p.title, p.intro, p.goal].some((t) => (t || '').toLowerCase().includes(q))
    );
  }

  // 角色和技能条件必须匹配到同一个招募角色；技能多选按「全部包含」匹配
  if (roleFilter || skills.length > 0) {
    list = list.filter((p) =>
      p.roles.some((r) => {
        const roleOk = !roleFilter || r.name.toLowerCase().includes(roleFilter);
        const skillsOk = skills.length === 0 || skills.every((s) => r.skills.some((rs) => String(rs).toLowerCase() === s));
        return roleOk && skillsOk;
      })
    );
  }

  if (['RECRUITING', 'PAUSED', 'FULL'].includes(statusFilter)) {
    list = list.filter((p) => p.display_status === statusFilter);
  }

  res.json({ projects: list });
}));

app.post('/api/projects', requireAuth, wrap((req, res) => {
  const title = cleanText(req.body.title, 120);
  const intro = cleanText(req.body.intro, 1000);
  const goal = cleanText(req.body.goal, 1000);
  const progress = cleanText(req.body.progress, 1000);
  const expected = cleanText(req.body.expected_outcome, 1000);
  if (!title || !intro || !goal || !progress || !expected) {
    throw new HttpError(400, '请填写完整的项目信息（标题、介绍、目标、当前进展、预期成果）');
  }

  const rawRoles = Array.isArray(req.body.roles) ? req.body.roles : [];
  if (rawRoles.length === 0) throw new HttpError(400, '请至少添加一种招募角色');
  if (rawRoles.length > 10) throw new HttpError(400, '招募角色最多 10 种');

  const roles = rawRoles.map((r) => {
    const name = cleanText(r && r.name, 60);
    const requirement = cleanText(r && r.skill_requirement, 200);
    const skills = cleanSkills(r && r.skills);
    const capacity = Math.round(Number(r && r.capacity));
    if (!name || !requirement) throw new HttpError(400, '每个招募角色都需要填写角色名称和技能要求');
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
      throw new HttpError(400, `角色「${name || '未命名'}」的人数上限需为 1-50 的整数`);
    }
    return { name, requirement, skills, capacity };
  });

  const createdAt = nowIso();
  const create = db.transaction(() => {
    const info = db.prepare(
      'INSERT INTO projects (owner_id, title, intro, goal, progress, expected_outcome, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, title, intro, goal, progress, expected, 'RECRUITING', createdAt);
    const projectId = Number(info.lastInsertRowid);
    // 发起人自动成为成员（role_id 为 NULL，不占招募名额）
    db.prepare('INSERT INTO members (project_id, role_id, user_id, is_owner, joined_at) VALUES (?, NULL, ?, 1, ?)')
      .run(projectId, req.user.id, createdAt);
    const insRole = db.prepare(
      'INSERT INTO roles (project_id, name, skill_requirement, skills, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const r of roles) insRole.run(projectId, r.name, r.requirement, JSON.stringify(r.skills), r.capacity, createdAt);
    return projectId;
  });

  const projectId = create();
  res.status(201).json({ project: buildProject(projectId, req.user.id) });
}));

app.get('/api/projects/:id', requireAuth, wrap((req, res) => {
  const id = Number(req.params.id);
  const project = Number.isInteger(id) ? buildProject(id, req.user.id) : null;
  if (!project) throw new HttpError(404, '项目不存在');
  res.json({ project });
}));

app.put('/api/projects/:id/status', requireAuth, wrap((req, res) => {
  const id = Number(req.params.id);
  const project = Number.isInteger(id) ? db.prepare('SELECT * FROM projects WHERE id = ?').get(id) : null;
  if (!project) throw new HttpError(404, '项目不存在');
  if (project.owner_id !== req.user.id) throw new HttpError(403, '只有发起人可以修改招募状态');
  const status = String(req.body.status || '').toUpperCase();
  if (!['RECRUITING', 'PAUSED'].includes(status)) throw new HttpError(400, '状态只能是 RECRUITING 或 PAUSED');
  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, id);
  res.json({ project: buildProject(id, req.user.id) });
}));

// 发起人查看本项目全部申请（含申请人资料快照与申请正文）
app.get('/api/projects/:id/applications', requireAuth, wrap((req, res) => {
  const id = Number(req.params.id);
  const project = Number.isInteger(id) ? db.prepare('SELECT * FROM projects WHERE id = ?').get(id) : null;
  if (!project) throw new HttpError(404, '项目不存在');
  if (project.owner_id !== req.user.id) throw new HttpError(403, '只有发起人可以查看本项目的申请');

  const rows = db.prepare(
    `SELECT a.*, u.username AS applicant_username, u.nickname AS applicant_nickname, r.name AS role_name
     FROM applications a
     JOIN users u ON u.id = a.applicant_id
     JOIN roles r ON r.id = a.role_id
     WHERE a.project_id = ?
     ORDER BY CASE a.status WHEN 'PENDING' THEN 0 ELSE 1 END, a.id DESC`
  ).all(id);

  const full = buildProject(id, req.user.id);
  const roleMap = new Map(full.roles.map((r) => [r.id, r]));

  res.json({
    project: full,
    applications: rows.map((row) => {
      const role = roleMap.get(row.role_id);
      return {
        ...serializeApplication(row),
        applicant_username: row.applicant_username,
        applicant_nickname: row.applicant_nickname,
        role_name: row.role_name,
        role_capacity: role ? role.capacity : 0,
        role_remaining: role ? role.remaining : 0,
        role_is_full: role ? role.is_full : true,
      };
    }),
  });
}));

// ---------------------------------------------------------------------------
// 申请
// ---------------------------------------------------------------------------
app.post('/api/projects/:id/applications', requireAuth, wrap((req, res) => {
  const id = Number(req.params.id);
  const project = Number.isInteger(id) ? db.prepare('SELECT * FROM projects WHERE id = ?').get(id) : null;
  if (!project) throw new HttpError(404, '项目不存在');
  if (project.owner_id === req.user.id) throw new HttpError(400, '不能申请自己发起的项目');
  if (project.status === 'PAUSED') throw new HttpError(409, '该项目已暂停招募，暂不能提交申请');

  const roleId = Number(req.body.role_id);
  const role = Number.isInteger(roleId)
    ? db.prepare('SELECT * FROM roles WHERE id = ? AND project_id = ?').get(roleId, id)
    : null;
  if (!role) throw new HttpError(400, '请选择有效的招募角色');

  const member = db.prepare('SELECT id FROM members WHERE project_id = ? AND user_id = ?').get(id, req.user.id);
  if (member) throw new HttpError(409, '你已加入该项目，不能重复申请');

  const pending = db.prepare(
    "SELECT id FROM applications WHERE project_id = ? AND applicant_id = ? AND status = 'PENDING'"
  ).get(id, req.user.id);
  if (pending) throw new HttpError(409, '你已有一条待审核申请，请等待审核或先撤回');

  const filled = db.prepare('SELECT COUNT(*) AS c FROM members WHERE role_id = ?').get(role.id).c;
  if (filled >= role.capacity) throw new HttpError(409, '该角色名额已满，不能申请');

  const reason = cleanText(req.body.reason, 600);
  const contribution = cleanText(req.body.contribution, 600);
  if (!reason) throw new HttpError(400, '请填写申请理由');
  if (!contribution) throw new HttpError(400, '请填写可承担的内容');

  const snapshot = JSON.stringify({
    nickname: req.user.nickname,
    bio: req.user.bio,
    skills: parseJsonArray(req.user.skills),
    weekly_hours: req.user.weekly_hours,
  });

  const info = db.prepare(
    'INSERT INTO applications (project_id, role_id, applicant_id, reason, contribution, status, profile_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, role.id, req.user.id, reason, contribution, 'PENDING', snapshot, nowIso());

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ application: serializeApplication(row), project: buildProject(id, req.user.id) });
}));

app.get('/api/applications/mine', requireAuth, wrap((req, res) => {
  const rows = db.prepare(
    `SELECT a.*, p.title AS project_title, p.status AS project_status, r.name AS role_name
     FROM applications a
     JOIN projects p ON p.id = a.project_id
     JOIN roles r ON r.id = a.role_id
     WHERE a.applicant_id = ?
     ORDER BY a.id DESC`
  ).all(req.user.id);
  res.json({
    applications: rows.map((row) => ({
      ...serializeApplication(row),
      project_title: row.project_title,
      project_status: row.project_status,
      role_name: row.role_name,
    })),
  });
}));

app.post('/api/applications/:id/withdraw', requireAuth, wrap((req, res) => {
  const id = Number(req.params.id);
  const appRow = Number.isInteger(id) ? db.prepare('SELECT * FROM applications WHERE id = ?').get(id) : null;
  if (!appRow) throw new HttpError(404, '申请不存在');
  if (appRow.applicant_id !== req.user.id) throw new HttpError(403, '只能撤回自己的申请');
  if (appRow.status !== 'PENDING') throw new HttpError(409, '只有待审核的申请可以撤回');
  db.prepare("UPDATE applications SET status = 'WITHDRAWN', decided_at = ? WHERE id = ?").run(nowIso(), id);
  res.json({ application: serializeApplication(db.prepare('SELECT * FROM applications WHERE id = ?').get(id)) });
}));

app.post('/api/applications/:id/accept', requireAuth, wrap((req, res) => {
  const id = Number(req.params.id);
  const appRow = Number.isInteger(id) ? db.prepare('SELECT * FROM applications WHERE id = ?').get(id) : null;
  if (!appRow) throw new HttpError(404, '申请不存在');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(appRow.project_id);
  if (project.owner_id !== req.user.id) throw new HttpError(403, '只有发起人可以审核申请');
  if (appRow.status !== 'PENDING') {
    throw new HttpError(409, `该申请已被处理（当前状态：${STATUS_LABELS[appRow.status] || appRow.status}），不能重复操作`);
  }

  // 名额检查与成员写入放在同一事务中，保证并发接受时不会突破人数上限
  const accept = db.transaction(() => {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(appRow.role_id);
    const filled = db.prepare('SELECT COUNT(*) AS c FROM members WHERE role_id = ?').get(role.id).c;
    if (filled >= role.capacity) {
      throw new HttpError(409, `角色「${role.name}」名额已满，无法接受；该申请仍保持待审核状态，你可以选择拒绝它`);
    }
    const existing = db.prepare('SELECT id FROM members WHERE project_id = ? AND user_id = ?').get(project.id, appRow.applicant_id);
    if (existing) throw new HttpError(409, '该申请人已经是项目成员');
    db.prepare('INSERT INTO members (project_id, role_id, user_id, is_owner, joined_at) VALUES (?, ?, ?, 0, ?)')
      .run(project.id, role.id, appRow.applicant_id, nowIso());
    db.prepare("UPDATE applications SET status = 'ACCEPTED', decided_at = ? WHERE id = ?").run(nowIso(), id);
  });
  accept();

  res.json({
    application: serializeApplication(db.prepare('SELECT * FROM applications WHERE id = ?').get(id)),
    project: buildProject(project.id, req.user.id),
  });
}));

app.post('/api/applications/:id/reject', requireAuth, wrap((req, res) => {
  const id = Number(req.params.id);
  const appRow = Number.isInteger(id) ? db.prepare('SELECT * FROM applications WHERE id = ?').get(id) : null;
  if (!appRow) throw new HttpError(404, '申请不存在');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(appRow.project_id);
  if (project.owner_id !== req.user.id) throw new HttpError(403, '只有发起人可以审核申请');
  if (appRow.status !== 'PENDING') {
    throw new HttpError(409, `该申请已被处理（当前状态：${STATUS_LABELS[appRow.status] || appRow.status}），不能重复操作`);
  }
  const reason = cleanText(req.body.reason, 200);
  if (!reason) throw new HttpError(400, '请填写拒绝原因');
  db.prepare("UPDATE applications SET status = 'REJECTED', reject_reason = ?, decided_at = ? WHERE id = ?")
    .run(reason, nowIso(), id);
  res.json({
    application: serializeApplication(db.prepare('SELECT * FROM applications WHERE id = ?').get(id)),
    project: buildProject(project.id, req.user.id),
  });
}));

// ---------------------------------------------------------------------------
// 兜底
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法的 JSON' });
  }
  console.error('[server] 未处理错误:', err);
  return res.status(500).json({ error: '服务器内部错误' });
});

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
seedIfEmpty(db);

app.listen(PORT, () => {
  console.log(`[server] TeamUp 后端已启动：http://localhost:${PORT}`);
  console.log(`[server] SQLite 数据库：${DB_PATH}`);
});
