import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { SopListPage } from "./pages/SopListPage";
import { SopNewPage } from "./pages/SopNewPage";
import { SopDetailPage } from "./pages/SopDetailPage";
import { AnalysisListPage } from "./pages/AnalysisListPage";
import { AnalysisNewPage } from "./pages/AnalysisNewPage";
import { AnalysisDetailPage } from "./pages/AnalysisDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";
import { LiveStartPage } from "./pages/LiveStartPage";
import { LiveWallPage } from "./pages/LiveWallPage";
import { WorkerPage } from "./pages/WorkerPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/work/:token" element={<WorkerPage />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="live/new" element={<LiveStartPage />} />
        <Route path="live/:id" element={<LiveWallPage />} />
        <Route path="cameras" element={<Navigate to="/settings?tab=cameras" replace />} />
        <Route path="sops" element={<SopListPage />} />
        <Route path="sops/new" element={<SopNewPage />} />
        <Route path="sops/:id" element={<SopDetailPage />} />
        <Route path="analyses" element={<AnalysisListPage />} />
        <Route path="analyses/new" element={<AnalysisNewPage />} />
        <Route path="analyses/:id" element={<AnalysisDetailPage />} />
        <Route path="users" element={<Navigate to="/settings?tab=users" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
