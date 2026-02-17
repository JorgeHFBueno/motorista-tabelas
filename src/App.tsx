import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ObraProvider } from "@/contexts/ObraContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import ObrasAtivas from "./pages/ObrasAtivas";
import Obra from "./pages/Obra";
import Financas from "./pages/Financas";
import Noticias from "./pages/Noticias";
import Atendimento from "./pages/Atendimento";
import Documentos from "./pages/Documentos";
import Fotos from "./pages/Fotos";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ObraProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Index />} />
                <Route path="/obras-ativas" element={<ObrasAtivas />} />
                <Route path="/obra" element={<Obra />} />
                <Route path="/financas" element={<Financas />} />
                <Route path="/noticias" element={<Noticias />} />
                <Route path="/atendimento" element={<Atendimento />} />
                <Route path="/documentos" element={<Documentos />} />
                <Route path="/fotos" element={<Fotos />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </ObraProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
