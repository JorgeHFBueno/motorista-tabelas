import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const AguardandoLiberacaoPage = () => {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Aguardando liberação</CardTitle>
          <CardDescription>
            Seu login foi realizado, mas não foi possível carregar um cadastro válido para esta conta. Tente novamente mais tarde.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void logout()}>Sair</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AguardandoLiberacaoPage;