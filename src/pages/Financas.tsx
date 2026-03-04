import { Construction } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const Financas = () => {

  return (
    <ResponsiveLayout headerTitle="Finanças" headerSubtitle="Gestão financeira da obra">
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <div className="flex h-[60vh] items-center justify-center">
          <Card className="w-full max-w-2xl text-center">
            <CardHeader className="items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Construction className="h-6 w-6 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl">Página em criação</CardTitle>
              <CardDescription>
                Este recurso está planejado para uma versão futura do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Em breve será possível acompanhar informações financeiras relacionadas às obras
              vinculadas ao seu acesso.
            </CardContent>
          </Card>
        </div>        
      </div>
    </ResponsiveLayout>
  );
};

export default Financas;
