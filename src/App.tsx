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

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="sops" element={<SopListPage />} />
        <Route path="sops/new" element={<SopNewPage />} />
        <Route path="sops/:id" element={<SopDetailPage />} />
        <Route path="analyses" element={<AnalysisListPage />} />
        <Route path="analyses/new" element={<AnalysisNewPage />} />
        <Route path="analyses/:id" element={<AnalysisDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
