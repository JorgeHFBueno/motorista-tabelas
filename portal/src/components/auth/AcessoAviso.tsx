import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

// Full-page notice for a login that cannot use the portal (no profile, deactivated, no contract).
const AcessoAviso = ({ titulo, descricao }: { titulo: string; descricao: string }) => {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{titulo}</CardTitle>
          <CardDescription>{descricao}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void logout()}>Sair</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AcessoAviso;
