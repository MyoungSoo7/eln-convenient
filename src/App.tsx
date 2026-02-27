import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
