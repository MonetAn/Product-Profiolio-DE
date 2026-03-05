import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ActivityProvider } from "@/contexts/ActivityContext";
import { ActivityTracker } from "@/components/ActivityTracker";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import AdminPeople from "./pages/AdminPeople";
import AdminAccess from "./pages/AdminAccess";
import AdminActivity from "./pages/AdminActivity";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <ActivityProvider>
            <ActivityTracker />
            <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute>
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/people" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminPeople />
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/access" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminAccess />
                </AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/activity" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminActivity />
                </AdminRoute>
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ActivityProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
