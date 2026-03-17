import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import SsoCallbackPage from "./pages/SsoCallbackPage";
import Dashboard from "./pages/Dashboard";
import NotesPage from "./pages/NotesPage";
import NoteEditor from "./pages/NoteEditor";
import ProtocolsPage from "./pages/ProtocolsPage";
import InventoryPage from "./pages/InventoryPage";
import SchedulerPage from "./pages/SchedulerPage";
import SearchPage from "./pages/SearchPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import SignaturesPage from "./pages/SignaturesPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import ExportsPage from "./pages/ExportsPage";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        // 401 오류는 재시도하지 않음
        if ((error as Error)?.message?.includes('인증이 만료')) return false;
        return failureCount < 2;
      },
    },
  },
});

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/sso-callback" element={<SsoCallbackPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/notes" element={<NotesPage />} />
                      <Route path="/notes/:id" element={<NoteEditor />} />
                      <Route path="/protocols" element={<ProtocolsPage />} />
                      <Route path="/inventory" element={<InventoryPage />} />
                      <Route path="/scheduler" element={<SchedulerPage />} />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/ai-assistant" element={<AIAssistantPage />} />
                      <Route path="/signatures" element={<SignaturesPage />} />
                      <Route path="/audit-logs" element={<AuditLogsPage />} />
                      <Route path="/exports" element={<ExportsPage />} />
                      <Route path="/admin/users" element={<AdminPage />} />
                      <Route path="/admin/roles" element={<AdminPage />} />
                      <Route path="/admin/settings" element={<AdminPage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
