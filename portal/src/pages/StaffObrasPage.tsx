import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { CadastroObraForm } from "@/components/obra/CadastroObraForm";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useAllObras, useObrasByIds } from "@/hooks/useAppQueries";

const StaffObrasPage = () => {
  const { userDoc } = useAuth();
  const [isCadastroOpen, setIsCadastroOpen] = useState(false);
  const obraIds = userDoc?.obras ?? [];
  const isAdmin = userDoc?.role === "admin";

  const { data: obrasVinculadas = [], isLoading: isLoadingVinculadas } = useObrasByIds(obraIds);
  const { data: todasObras = [], isLoading: isLoadingTodas } = useAllObras(isAdmin);

  const obras = isAdmin ? todasObras : obrasVinculadas;
  const isLoading = isAdmin ? isLoadingTodas : isLoadingVinculadas;

  return (
    <ResponsiveLayout
      headerTitle="Painel de Obras"
      headerSubtitle={isAdmin ? "Todas as obras do sistema" : "Obras permitidas para seu usuário"}
    >
      <div className="space-y-4 px-4 py-6 lg:px-8 lg:py-8">
        <div className="flex justify-end">
          <Button onClick={() => setIsCadastroOpen((current) => !current)} className="gap-2">
            <Plus className="h-4 w-4" />
            {isCadastroOpen ? "Fechar cadastro" : "Nova obra"}
          </Button>
        </div>

        {isCadastroOpen && (
          <Card>
            <CardHeader>
              <CardTitle>Cadastro de obras</CardTitle>
              <CardDescription>Criação básica de obras no Firestore.</CardDescription>
            </CardHeader>
            <CardContent>
              <CadastroObraForm onSuccess={() => setIsCadastroOpen(false)} />
            </CardContent>
          </Card>
        )}

        {isLoading && <p className="text-muted-foreground">Carregando obras...</p>}
         {!isLoading && obras.length === 0 && (
          <p className="text-muted-foreground">Nenhuma obra vinculada. Contate o administrador.</p>
        )}
        {!isLoading && obras.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {obras.map((obra) => (
              <Link key={obra.id} to={`/painel/obras/${obra.id}`} className="block h-full rounded-xl border p-4 hover:bg-muted/40">
                <p className="font-medium">{obra.nome ?? "Obra sem nome"}</p>
                <p className="text-sm text-muted-foreground">Status: {obra.statusResumo ?? "-"}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ResponsiveLayout>
  );
};

export default StaffObrasPage;
