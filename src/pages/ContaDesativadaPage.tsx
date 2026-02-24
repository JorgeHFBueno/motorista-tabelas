import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const ContaDesativadaPage = () => {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Conta desativada</CardTitle>
          <CardDescription>Seu acesso está desativado. Entre em contato com o administrador.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void logout()}>Sair</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContaDesativadaPage;