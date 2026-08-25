import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Faqs from "./pages/Faqs";
import Orders from "./pages/Orders";
import Conversations from "./pages/Conversations";
import Leads from "./pages/Leads";
import Customers from "./pages/Customers";
import Schedule from "./pages/Schedule";
import Settings from "./pages/Settings";
import AdminDashboard from "./pages/AdminDashboard";
import AdminAccounts from "./pages/AdminAccounts";
import AdminUserDetail from "./pages/AdminUserDetail";
import AdminSettings from "./pages/AdminSettings";
import NotFound from "./pages/NotFound";
import { useFcmToken } from "./hooks/useFcmToken";

const queryClient = new QueryClient();

function AppContent() {
  useFcmToken();
  return null;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/products" element={<Products />} />
            <Route path="/dashboard/faqs" element={<Faqs />} />
            <Route path="/dashboard/orders" element={<Orders />} />
            <Route path="/dashboard/conversations" element={<Conversations />} />
            <Route path="/dashboard/leads" element={<Leads />} />
            <Route path="/dashboard/customers" element={<Customers />} />
            <Route path="/dashboard/schedule" element={<Schedule />} />
            <Route path="/dashboard/settings" element={<Settings />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/accounts" element={<AdminAccounts />} />
            <Route path="/admin/accounts/:userId" element={<AdminUserDetail />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
