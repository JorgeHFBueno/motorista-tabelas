import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateAccessRequest, useMyAccessRequests } from "@/hooks/useAppQueries";
import { toast } from "@/hooks/use-toast";

const ClienteSemObraPage = () => {
  const { user, userDoc, logout } = useAuth();
  const { data: requests = [], isLoading } = useMyAccessRequests(user?.uid);
  const createRequest = useCreateAccessRequest();

  const hasPendingRequest = requests.some((item) => item.status === "pendente");
  const latestRequest = requests[0];

  const handleCreateRequest = async () => {
    if (!user) {
      return;
    }

    try {
      await createRequest.mutateAsync({
        uid: user.uid,
        nomeSnapshot: userDoc?.nome ?? user.displayName ?? user.email ?? "Usuário",
        emailSnapshot: user.email ?? "",
      });
      toast({ title: "Pedido enviado", description: "Seu pedido de vínculo foi registrado." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível enviar o pedido.";
      toast({ title: "Falha ao enviar pedido", description: message, variant: "destructive" });
    }
  };

  return (
    <ResponsiveLayout headerTitle="Sem obra vinculada" headerSubtitle="Conta ativa, aguardando vínculo">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma obra vinculada ao seu usuário</CardTitle>
            <CardDescription>
              Seu acesso está ativo, mas ainda não existe uma obra associada. Solicite o vínculo e aguarde a liberação do time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando solicitações...</p>}
            {!isLoading && latestRequest && (
              <p className="text-sm text-muted-foreground">
                Último pedido: <span className="font-medium">{latestRequest.status}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleCreateRequest()}
                disabled={hasPendingRequest || createRequest.isPending}
              >
                {hasPendingRequest ? "Pedido já pendente" : "Solicitar vínculo"}
              </Button>
              <Button variant="outline" onClick={() => void logout()}>
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ResponsiveLayout>
  );
};

export default ClienteSemObraPage;