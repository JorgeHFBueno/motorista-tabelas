import { Building2, MapPin, Calendar, TrendingUp, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";

// Mock data - em produção viria do backend
const obrasAtivas = [
  {
    id: 1,
    nome: "Residência Silva",
    endereco: "Rua das Flores, 123 - Porto Alegre/RS",
    etapaAtual: "Estrutura",
    progresso: 45,
    previsaoEntrega: "Mar/2025",
    status: "Em dia",
  },
  {
    id: 2,
    nome: "Galpão Industrial Metalúrgica ABC",
    endereco: "Av. Industrial, 500 - Canoas/RS",
    etapaAtual: "Fundação",
    progresso: 22,
    previsaoEntrega: "Jun/2025",
    status: "Em dia",
  },
  {
    id: 3,
    nome: "Centro de Distribuição Logística Norte",
    endereco: "Rod. BR-116, Km 42 - Novo Hamburgo/RS",
    etapaAtual: "Cobertura",
    progresso: 68,
    previsaoEntrega: "Fev/2025",
    status: "Adiantado",
  },
];

const getStatusVariant = (status: string) => {
  switch (status) {
    case "Em dia":
      return "default";
    case "Adiantado":
      return "secondary";
    case "Atrasado":
      return "destructive";
    default:
      return "outline";
  }
};

const ObrasAtivas = () => {
  const navigate = useNavigate();

  const handleObraClick = (obraId: number) => {
    // Navega para a página de detalhes da obra
    // Em produção, passaria o ID como parâmetro
    navigate("/obra");
  };

  return (
    <ResponsiveLayout
      showHeader
      headerTitle="Obras Ativas"
      headerSubtitle="Visão geral das obras em execução"
    >
      <div className="p-4 lg:p-8 space-y-6">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-2xl font-semibold text-foreground">
              Suas Obras
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {obrasAtivas.length} obra{obrasAtivas.length !== 1 ? "s" : ""} em execução
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span>Atualizado agora</span>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
          {obrasAtivas.map((obra) => (
            <Card
              key={obra.id}
              className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-primary/30 group overflow-hidden"
              onClick={() => handleObraClick(obra.id)}
            >
              {/* Seção de Identidade da Obra */}
              <div className="bg-primary/5 border-b border-border px-4 lg:px-5 py-3 lg:py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 lg:w-11 lg:h-11 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-base lg:text-lg leading-tight">
                        {obra.nome}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{obra.endereco}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </div>
              </div>

              {/* Seção de Informações Operacionais */}
              <CardContent className="p-4 lg:p-5">
                {/* Progresso */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progresso geral</span>
                    <span className="font-semibold text-foreground">{obra.progresso}%</span>
                  </div>
                  <Progress value={obra.progresso} className="h-2" />
                </div>

                {/* Info Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-4 text-xs lg:text-sm">
                    <div>
                      <p className="text-muted-foreground">Etapa atual</p>
                      <p className="font-medium text-foreground">{obra.etapaAtual}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Previsão</p>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        <p className="font-medium text-foreground">{obra.previsaoEntrega}</p>
                      </div>
                    </div>
                  </div>
                  <Badge variant={getStatusVariant(obra.status)} className="text-xs">
                    {obra.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State - para quando não houver obras */}
        {obrasAtivas.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhuma obra ativa
            </h3>
            <p className="text-sm text-muted-foreground">
              Quando você tiver obras em execução, elas aparecerão aqui.
            </p>
          </div>
        )}
      </div>
    </ResponsiveLayout>
  );
};

export default ObrasAtivas;
