'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

// 数据目录：Docker 中为 /app/data（docker-compose.yml 将 ./backend/data 挂载到此），
// 本地直接运行 node 时回退到 backend/data。
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'teamup.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  weekly_hours INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  intro TEXT NOT NULL,
  goal TEXT NOT NULL,
  progress TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECRUITING' CHECK (status IN ('RECRUITING', 'PAUSED')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  skill_requirement TEXT NOT NULL,
  skills TEXT NOT NULL DEFAULT '[]',
  capacity INTEGER NOT NULL CHECK (capacity >= 1),
  created_at TEXT NOT NULL
);

-- 成员表：发起人也有成员记录（is_owner = 1，role_id 为 NULL），
-- 但名额计算只统计 role_id 指向该角色的成员，因此发起人不占招募名额。
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES roles(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  is_owner INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  applicant_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  contribution TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN')),
  reject_reason TEXT,
  profile_snapshot TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_applications_project ON applications (project_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON applications (applicant_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);
CREATE INDEX IF NOT EXISTS idx_members_role ON members (role_id);
CREATE INDEX IF NOT EXISTS idx_roles_project ON roles (project_id);
`);

// 密码散列：scrypt + 随机盐（Node 内置 crypto，无需额外依赖）
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = parts[1];
    const expected = Buffer.from(parts[2], 'hex');
    const actual = Buffer.from(crypto.scryptSync(String(password), salt, 64).toString('hex'), 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

module.exports = { db, DB_PATH, DATA_DIR, hashPassword, verifyPassword };
