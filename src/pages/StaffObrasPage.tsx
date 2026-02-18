import { Link } from "react-router-dom";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useObrasByIds } from "@/hooks/useAppQueries";

const StaffObrasPage = () => {
  const { userDoc } = useAuth();
  const obraIds = userDoc?.obras ?? [];
  const { data: obras = [], isLoading } = useObrasByIds(obraIds);

  return (
    <ResponsiveLayout headerTitle="Painel de Obras" headerSubtitle="Obras permitidas para seu usuário">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        {isLoading && <p className="text-muted-foreground">Carregando obras...</p>}
        {!isLoading && obras.length === 0 && <p className="text-muted-foreground">Nenhuma obra vinculada ao usuário.</p>}
        {obras.map((obra) => (
          <Link key={obra.id} to={`/painel/obras/${obra.id}`} className="block rounded-xl border p-4 hover:bg-muted/40">
            <p className="font-medium">{obra.nome}</p>
            <p className="text-sm text-muted-foreground">Status: {obra.status}</p>
          </Link>
        ))}
      </div>
    </ResponsiveLayout>
  );
};

export default StaffObrasPage;