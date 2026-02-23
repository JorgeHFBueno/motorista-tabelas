import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ObraProvider } from "@/contexts/ObraContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { firebaseInitError } from "@/lib/firebase";
import FirebaseInitErrorScreen from "@/components/FirebaseInitErrorScreen";
import {
  ClientRoute,
  ObraAccessRoute,
  ProtectedRoute,
  RoleHomeRedirect,
  StaffRoute,
} from "@/components/auth/RouteGuards";
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/NotFound";
import Obra from "@/pages/Obra";
import Financas from "@/pages/Financas";
import Documentos from "@/pages/Documentos";
import Fotos from "@/pages/Fotos";
import UploadPage from "@/pages/UploadPage";
import StaffObrasPage from "@/pages/StaffObrasPage";
import StaffObraDetailPage from "@/pages/StaffObraDetailPage";
import StaffCadastrosPage from "@/pages/StaffCadastrosPage";
import StaffObraUploadPage from "@/pages/StaffObraUploadPage";

const queryClient = new QueryClient();

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
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<RoleHomeRedirect />} />

                <Route element={<ClientRoute />}>
                  <Route path="/cliente/obra" element={<Obra />} />
                  <Route path="/cliente/financas" element={<Financas />} />
                  <Route path="/cliente/documentos" element={<Documentos />} />
                  <Route path="/cliente/fotos" element={<Fotos />} />
                </Route>

                <Route element={<StaffRoute />}>
                  <Route path="/painel/obras" element={<StaffObrasPage />} />
                  <Route element={<ObraAccessRoute />}>
                    <Route path="/painel/obras/:obraId" element={<StaffObraDetailPage />} />
                  </Route>
                  <Route path="/painel/upload" element={<UploadPage />} />
                  <Route element={<ObraAccessRoute />}>
                    <Route path="/painel/obras/:obraId/upload" element={<StaffObraUploadPage />} />
                  </Route>
                  <Route path="/painel/cadastros" element={<StaffCadastrosPage />} />
                </Route>
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
