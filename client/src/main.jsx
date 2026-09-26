import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { Layout } from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { AuthProvider, LiveProvider, ThemeProvider, useAuth } from './state.jsx';
import Alerts from './pages/Alerts.jsx';
import CreatePost from './pages/CreatePost.jsx';
import Feed from './pages/Feed.jsx';
import Impact from './pages/Impact.jsx';
import Landing from './pages/Landing.jsx';
import Me from './pages/Me.jsx';
import MyPosts from './pages/MyPosts.jsx';
import MyRequests from './pages/MyRequests.jsx';
import Nearby from './pages/Nearby.jsx';
import PostDetail from './pages/PostDetail.jsx';
import Settings from './pages/Settings.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  const { user } = useAuth();
  if (user === undefined) return <Loading label="Opening sharingPlates…" />;
  if (!user) return <Landing />;
  return (
    <LiveProvider>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Feed />} />
          <Route path="nearby" element={<Nearby />} />
          <Route path="post" element={<CreatePost />} />
          <Route path="posts/:id" element={<PostDetail />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="my-posts" element={<MyPosts />} />
          <Route path="requests" element={<MyRequests />} />
          <Route path="impact" element={<Impact />} />
          <Route path="settings" element={<Settings />} />
          <Route path="me" element={<Me />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LiveProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
