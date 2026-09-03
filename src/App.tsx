import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useAuth } from "./lib/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { SopListPage } from "./pages/SopListPage";
import { SopNewPage } from "./pages/SopNewPage";
import { SopDetailPage } from "./pages/SopDetailPage";
import { AnalysisListPage } from "./pages/AnalysisListPage";
import { AnalysisNewPage } from "./pages/AnalysisNewPage";
import { AnalysisDetailPage } from "./pages/AnalysisDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { LoginPage } from "./pages/LoginPage";

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="sops" element={<SopListPage />} />
        <Route path="sops/new" element={<SopNewPage />} />
        <Route path="sops/:id" element={<SopDetailPage />} />
        <Route path="analyses" element={<AnalysisListPage />} />
        <Route path="analyses/new" element={<AnalysisNewPage />} />
        <Route path="analyses/:id" element={<AnalysisDetailPage />} />
        <Route
          path="users"
          element={
            <AdminOnly>
              <UsersPage />
            </AdminOnly>
          }
        />
        <Route
          path="settings"
          element={
            <AdminOnly>
              <SettingsPage />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
