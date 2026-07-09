import { useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { SuperAdminRoute } from "@/components/SuperAdminRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Preloader } from "@/components/ui/Preloader";

import Auth from "./pages/Auth";
import OTPVerification from "./pages/OTPVerification";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import VoiceHub from "./pages/VoiceHub";
import HealthVault from "./pages/HealthVault";
import SchemeNavigator from "./pages/SchemeNavigator";
import Profile from "./pages/Profile";
import Emergency from "./pages/Emergency";
import Unauthorized from "./pages/Unauthorized";
import AdminDashboard from "./pages/admin/AdminDashboard";
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [showPreloader, setShowPreloader] = useState(true);
  const handlePreloaderComplete = useCallback(() => setShowPreloader(false), []);

  return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        {showPreloader && <Preloader onComplete={handlePreloaderComplete} />}
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/verify-otp" element={<OTPVerification />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/unauthorized" element={<Unauthorized />} />

              {/* Protected routes with layout */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/voice-hub" element={<VoiceHub />} />
                <Route path="/health-vault" element={<HealthVault />} />
                <Route path="/schemes" element={<SchemeNavigator />} />
                <Route path="/emergency" element={<Emergency />} />
                <Route path="/profile" element={<Profile />} />
              </Route>

              {/* Admin routes with layout */}
              <Route element={<AdminRoute><AppLayout /></AdminRoute>}>
                <Route path="/admin/*" element={<AdminDashboard />} />
              </Route>
              <Route element={<SuperAdminRoute><AppLayout /></SuperAdminRoute>}>
                <Route path="/superadmin" element={<SuperAdminDashboard />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
};

export default App;
