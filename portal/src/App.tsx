import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ObraProvider } from "@/contexts/ObraContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { firebaseInitError } from "@/lib/firebase";
import FirebaseInitErrorScreen from "@/components/FirebaseInitErrorScreen";
import { ClientRoute } from "@/components/auth/RouteGuards";
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/NotFound";
import Obra from "@/pages/Obra";
import Financas from "@/pages/Financas";
import Documentos from "@/pages/Documentos";
import Fotos from "@/pages/Fotos";
import Index from "./pages/Index";
import Noticias from "@/pages/Noticias";
import Atendimento from "@/pages/Atendimento";

const queryClient = new QueryClient();

// Client-only site (Manuscript 03_APLICACAO_WEB/16_PORTAL_DO_CLIENTE.md); the team works in the main WEB.
const App = () => {
  if (firebaseInitError) {
    return <FirebaseInitErrorScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ObraProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ClientRoute />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/obra" element={<Obra />} />
                  <Route path="/financas" element={<Financas />} />
                  <Route path="/documentos" element={<Documentos />} />
                  <Route path="/fotos" element={<Fotos />} />
                  <Route path="/noticias" element={<Noticias />} />
                  <Route path="/atendimento" element={<Atendimento />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </ObraProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
