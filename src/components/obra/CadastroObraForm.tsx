import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";

type ObraStatus = "ativa" | "concluida";

type CadastroObraFormProps = {
  onSuccess?: () => void | Promise<void>;
  submitLabel?: string;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  const maybeError = error as { message?: string };
  if (typeof maybeError?.message === "string") return maybeError.message;

  return "Falha ao executar operacao.";
};

export const CadastroObraForm = ({ onSuccess, submitLabel = "Criar obra" }: CadastroObraFormProps) => {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState<ObraStatus>("ativa");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateObra = async () => {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      toast({ title: "Nome obrigatorio", description: "Informe o nome da obra.", variant: "destructive" });
      return;
    }

    try {
      setIsCreating(true);
      await addDoc(collection(db, "obras"), {
        nome: nomeLimpo,
        descricao: descricao.trim() || null,
        status,
        createdAt: serverTimestamp(),
      });

      setNome("");
      setDescricao("");
      setStatus("ativa");

      await queryClient.invalidateQueries({ queryKey: ["allObras"] });

      toast({
        title: "Obra criada",
        description: "Obra registrada com sucesso.",
      });

      await onSuccess?.();
    } catch (error) {
      toast({ title: "Sem permissao para criar", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="nome-obra">Nome</Label>
          <Input id="nome-obra" value={nome} onChange={(event) => setNome(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={(value: ObraStatus) => setStatus(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="concluida">Concluida</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="descricao-obra">Descricao (opcional)</Label>
        <Input id="descricao-obra" value={descricao} onChange={(event) => setDescricao(event.target.value)} />
      </div>
      <Button onClick={() => void handleCreateObra()} disabled={isCreating}>
        {isCreating ? "Criando..." : submitLabel}
      </Button>
    </div>
  );
};
