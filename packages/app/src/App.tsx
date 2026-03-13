import { Navigate, Route, Routes } from "react-router-dom";
import { RootRedirect } from "./routes/RootRedirect";
import { AuthPage } from "./routes/AuthPage";
import { DashboardPage } from "./routes/DashboardPage";
import { WorkshopPlaceholderPage } from "./routes/WorkshopPlaceholderPage";
import { TerminalPage } from "./routes/TerminalPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/workshop" element={<WorkshopPlaceholderPage />} />
      <Route path="/terminal/:sessionId" element={<TerminalPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
