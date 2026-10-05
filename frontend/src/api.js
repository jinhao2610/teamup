// 统一 API 客户端：负责拼地址、带登录 Token、解析后端错误信息。
// VITE_API_BASE 在构建时写入，默认指向本机后端 http://localhost:3001。
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

const TOKEN_KEY = 'teamup_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('无法连接服务器，请确认后端已启动（http://localhost:3001）');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (res.status === 401 && auth) {
    setToken(null);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
    throw new Error('登录已失效，请重新登录');
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `请求失败（HTTP ${res.status}）`);
  }
  return data;
}

export const Api = {
  login: (username, password) => api('/api/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  me: () => api('/api/auth/me'),
  updateProfile: (data) => api('/api/me', { method: 'PUT', body: data }),
  skills: () => api('/api/meta/skills'),
  projects: (params) => api(`/api/projects?${new URLSearchParams(params || {})}`),
  project: (id) => api(`/api/projects/${id}`),
  createProject: (data) => api('/api/projects', { method: 'POST', body: data }),
  myProjects: () => api('/api/projects/mine'),
  setProjectStatus: (id, status) => api(`/api/projects/${id}/status`, { method: 'PUT', body: { status } }),
  projectApplications: (id) => api(`/api/projects/${id}/applications`),
  apply: (id, data) => api(`/api/projects/${id}/applications`, { method: 'POST', body: data }),
  myApplications: () => api('/api/applications/mine'),
  withdraw: (id) => api(`/api/applications/${id}/withdraw`, { method: 'POST' }),
  accept: (id) => api(`/api/applications/${id}/accept`, { method: 'POST' }),
  reject: (id, reason) => api(`/api/applications/${id}/reject`, { method: 'POST', body: { reason } }),
};

export const APPLICATION_STATUS_LABELS = {
  PENDING: '待审核',
  ACCEPTED: '已通过',
  REJECTED: '已拒绝',
  WITHDRAWN: '已撤回',
};

export const PROJECT_STATUS_LABELS = {
  RECRUITING: '招募中',
  PAUSED: '已暂停',
  FULL: '已满员',
};

export function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
