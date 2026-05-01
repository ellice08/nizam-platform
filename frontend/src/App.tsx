import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { PublicLayout } from "@/components/layout/PublicLayout";
import { AppLayout } from "@/components/layout/AppLayout";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";

import AdminOverview from "./pages/admin/AdminOverview";
import AdminClientDetail from "./pages/admin/AdminClientDetail";
import AdminOnboard from "./pages/admin/AdminOnboard";

import DashboardOverview from "./pages/dashboard/DashboardOverview";
import Conversations from "./pages/dashboard/Conversations";
import Knowledge from "./pages/dashboard/Knowledge";
import Agent from "./pages/dashboard/Agent";
import Analytics from "./pages/dashboard/Analytics";
import Billing from "./pages/dashboard/Billing";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
          </Route>

          {/* Admin */}
          <Route element={<AppLayout variant="admin" />}>
            <Route path="/admin" element={<AdminOverview />} />
            <Route path="/admin/onboard" element={<AdminOnboard />} />
            <Route path="/admin/clients/:id" element={<AdminClientDetail />} />
          </Route>

          {/* Dashboard */}
          <Route element={<AppLayout variant="dashboard" />}>
            <Route path="/dashboard" element={<DashboardOverview />} />
            <Route path="/dashboard/conversations" element={<Conversations />} />
            <Route path="/dashboard/knowledge" element={<Knowledge />} />
            <Route path="/dashboard/agent" element={<Agent />} />
            <Route path="/dashboard/analytics" element={<Analytics />} />
            <Route path="/dashboard/billing" element={<Billing />} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
