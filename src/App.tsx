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

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/obras-ativas"
                element={
                  <ProtectedRoute>
                    <ObrasAtivas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/obra"
                element={
                  <ProtectedRoute>
                    <Obra />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/financas"
                element={
                  <ProtectedRoute>
                    <Financas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/noticias"
                element={
                  <ProtectedRoute>
                    <Noticias />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/atendimento"
                element={
                  <ProtectedRoute>
                    <Atendimento />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documentos"
                element={
                  <ProtectedRoute>
                    <Documentos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/fotos"
                element={
                  <ProtectedRoute>
                    <Fotos />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ObraProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
