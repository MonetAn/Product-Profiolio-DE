import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { AdminSuperAdminRoute } from "@/components/AdminSuperAdminRoute";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import AdminPeople from "./pages/AdminPeople";
import AdminMarkets from "./pages/AdminMarkets";
import AdminAccess from "./pages/AdminAccess";
import AdminActivity from "./pages/AdminActivity";
import AdminSensitive from "./pages/AdminSensitive";
import AdminPeopleEffortFill from "./pages/AdminPeopleEffortFill";
import AdminFillAnalytics from "./pages/AdminFillAnalytics";
import AdminLocationAllocations from "./pages/AdminLocationAllocations";
import Auth from "./pages/Auth";
import EmbedPortfolio from "./pages/EmbedPortfolio";
import NotFound from "./pages/NotFound";
import Unification from "./pages/Unification";
import { EarlyAccessRoute } from "@/components/EarlyAccessRoute";
import { isAdminActivityEnabled } from "@/lib/supabaseBackend";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

const DefaultDashboardRedirect = () => {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: "/allocations", search: location.search }}
      replace
    />
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
            <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/embed/:slug" element={<EmbedPortfolio />} />
            <Route path="/" element={<DefaultDashboardRedirect />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/allocations" element={
              <ProtectedRoute>
                <AdminLocationAllocations />
              </ProtectedRoute>
            } />
            <Route path="/unification" element={<Navigate to="/admin/unification" replace />} />
            <Route path="/admin/unification" element={
              <ProtectedRoute>
                <AdminRoute>
                  <EarlyAccessRoute redirectTo="/admin">
                    <Unification />
                  </EarlyAccessRoute>
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute>
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/location-allocations" element={
              <Navigate to="/allocations" replace />
            } />
            <Route path="/admin/people-effort" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminPeopleEffortFill />
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/people" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminSuperAdminRoute>
                    <AdminPeople />
                  </AdminSuperAdminRoute>
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/markets" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminSuperAdminRoute>
                    <AdminMarkets />
                  </AdminSuperAdminRoute>
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/access" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminSuperAdminRoute>
                    <AdminAccess />
                  </AdminSuperAdminRoute>
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/activity" element={
              isAdminActivityEnabled() ? (
                <ProtectedRoute>
                  <AdminRoute>
                    <AdminSuperAdminRoute>
                      <AdminActivity />
                    </AdminSuperAdminRoute>
                  </AdminRoute>
                </ProtectedRoute>
              ) : (
                <Navigate to="/admin" replace />
              )
            } />
            <Route path="/admin/additional" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminSuperAdminRoute>
                    <AdminSensitive />
                  </AdminSuperAdminRoute>
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/sensitive" element={<Navigate to="/admin/additional" replace />} />
            <Route path="/admin/fill-analytics" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminSuperAdminRoute>
                    <AdminFillAnalytics />
                  </AdminSuperAdminRoute>
                </AdminRoute>
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
