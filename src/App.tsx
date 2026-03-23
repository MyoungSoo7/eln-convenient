import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import LoginPage from "./pages/LoginPage";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const NotesPage = lazy(() => import("./pages/NotesPage"));
const NoteEditor = lazy(() => import("./pages/NoteEditor"));
const ProtocolsPage = lazy(() => import("./pages/ProtocolsPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const SchedulerPage = lazy(() => import("./pages/SchedulerPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const SignaturesPage = lazy(() => import("./pages/SignaturesPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const ExportsPage = lazy(() => import("./pages/ExportsPage"));
const OrgTeamUserPage = lazy(() => import("./pages/admin/OrgTeamUserPage"));
const RolesPage = lazy(() => import("./pages/admin/RolesPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));
const CodeManagePage = lazy(() => import("./pages/admin/CodeManagePage"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/notes" element={<NotesPage />} />
                      <Route path="/notes/:id" element={<NoteEditor />} />
                      <Route path="/protocols" element={<ProtocolsPage />} />
                      <Route path="/inventory" element={<InventoryPage />} />
                      <Route path="/scheduler" element={<SchedulerPage />} />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/signatures" element={<SignaturesPage />} />
                      <Route path="/audit-logs" element={<AuditLogsPage />} />
                      <Route path="/exports" element={<ExportsPage />} />
                      <Route path="/admin/users" element={<AdminRoute><OrgTeamUserPage /></AdminRoute>} />
                      <Route path="/admin/roles" element={<AdminRoute><RolesPage /></AdminRoute>} />
                      <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
                      <Route path="/admin/codes" element={<AdminRoute><CodeManagePage /></AdminRoute>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    </Suspense>
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
