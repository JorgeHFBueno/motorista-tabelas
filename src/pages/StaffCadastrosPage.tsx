import { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useObrasByIds } from "@/hooks/useAppQueries";
import { db } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";

const StaffCadastrosPage = () => {
  const { userDoc } = useAuth();
  const [search, setSearch] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState<"ativa" | "concluida">("ativa");
  const [isCreating, setIsCreating] = useState(false);

  const obraIds = userDoc?.obras ?? [];
  const { data: obras = [], isLoading } = useObrasByIds(obraIds);

  const filteredObras = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return obras;
    }

    return obras.filter(
      (obra) =>
        obra.nome.toLowerCase().includes(normalized) ||
        (obra.descricao ?? "").toLowerCase().includes(normalized),
    );
  }, [obras, search]);

  const handleCreateObra = async () => {
    if (!nome.trim()) {
      toast({ title: "Nome obrigatório", description: "Informe o nome da obra.", variant: "destructive" });
      return;
    }

    try {
      setIsCreating(true);
      await addDoc(collection(db, "obras"), {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        status,
        createdAt: serverTimestamp(),
      });

      setNome("");
      setDescricao("");
      setStatus("ativa");

      toast({
        title: "Obra criada",
        description: "Obra registrada. Para visualização, inclua o obraId em users/{uid}.obras no Console.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar a obra.";
      toast({ title: "Sem permissão para criar", description: message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ResponsiveLayout headerTitle="Cadastros" headerSubtitle="Obras e instruções de vínculo">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cadastro de obras</CardTitle>
            <CardDescription>
              Crie obras quando as regras permitirem gravação. A edição de obra está reservada para próxima etapa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="nome-obra">Nome</Label>
                <Input id="nome-obra" value={nome} onChange={(event) => setNome(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={(value: "ativa" | "concluida") => setStatus(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="descricao-obra">Descrição (opcional)</Label>
              <Input id="descricao-obra" value={descricao} onChange={(event) => setDescricao(event.target.value)} />
            </div>
            <Button onClick={() => void handleCreateObra()} disabled={isCreating}>
              {isCreating ? "Criando..." : "Criar obra"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Obras vinculadas ao seu acesso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Buscar por nome/descrição" value={search} onChange={(event) => setSearch(event.target.value)} />
            {isLoading && <p className="text-sm text-muted-foreground">Carregando obras...</p>}
            {!isLoading && filteredObras.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma obra encontrada.</p>}
            <div className="space-y-2">
              {filteredObras.map((obra) => (
                <div key={obra.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{obra.nome}</p>
                    <p className="text-sm text-muted-foreground">Status: {obra.status}</p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="outline" disabled>
                            Editar
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Disponível quando funções forem habilitadas.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Como vincular cliente à obra</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. Abra o Firebase Console &gt; Firestore &gt; coleção users.</p>
            <p>2. Localize o documento do cliente em users/{`{uid}`}. </p>
            <p>3. No campo obras (array), adicione o obraId desejado.</p>
            <p>4. Salve e peça para o cliente atualizar a sessão.</p>
          </CardContent>
        </Card>
      </div>
    </ResponsiveLayout>
  );
};

export default StaffCadastrosPage;