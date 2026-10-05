import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useToast } from '../toast';

const DEMO_ACCOUNTS = ['alice', 'bob', 'carol', 'dave'];

export default function Login() {
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('demo1234');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const user = await login(username.trim(), password);
      toast.success(`欢迎回来，${user.nickname}`);
      navigate('/projects');
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card card">
        <h1 className="login-title">🤝 TeamUp</h1>
        <p className="muted login-sub">项目组队与成员招募平台 · 请使用测试账号登录</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>用户名</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="alice" autoComplete="username" />
          </div>
          <div className="field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="demo1234"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
        <div className="demo-box">
          <div className="muted">测试账号（密码均为 demo1234），点击可快速填入：</div>
          <div className="demo-buttons">
            {DEMO_ACCOUNTS.map((name) => (
              <button
                key={name}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setUsername(name);
                  setPassword('demo1234');
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
