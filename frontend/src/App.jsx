import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import NewProject from './pages/NewProject';
import MyApplications from './pages/MyApplications';
import MyProjects from './pages/MyProjects';
import ProjectApplicants from './pages/ProjectApplicants';
import Profile from './pages/Profile';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">加载中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <div className="loading">加载中…</div> : user ? <Navigate to="/projects" replace /> : <Login />}
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/new" element={<NewProject />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/applicants" element={<ProjectApplicants />} />
        <Route path="/my/projects" element={<MyProjects />} />
        <Route path="/my/applications" element={<MyApplications />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
