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
import { adminCreateUser, adminLinkObra, adminSetRole, adminUnlinkObra } from "@/lib/functions";
import { toast } from "@/hooks/use-toast";
import type { UserRole, UserType } from "@/types/rbac";

const ROLE_OPTIONS: UserRole[] = ["admin", "gerente", "operacional", "cliente"];
const TIPO_OPTIONS: UserType[] = ["cliente", "funcionario"];

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  const maybeError = error as { message?: string };
  if (typeof maybeError?.message === "string") return maybeError.message;

  return "Falha ao executar operação.";
};

const StaffCadastrosPage = () => {
  const { userDoc } = useAuth();
  const isAdmin = userDoc?.role === "admin";

  const [search, setSearch] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState<"ativa" | "concluida">("ativa");
  const [isCreating, setIsCreating] = useState(false);

  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<UserType>("cliente");
  const [novoRole, setNovoRole] = useState<UserRole>("cliente");
  const [novoObrasRaw, setNovoObrasRaw] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  const [targetUidRole, setTargetUidRole] = useState("");
  const [targetRole, setTargetRole] = useState<UserRole>("cliente");
  const [targetTipo, setTargetTipo] = useState<UserType>("cliente");
  const [targetAtivo, setTargetAtivo] = useState<"true" | "false">("true");
  const [updatingRole, setUpdatingRole] = useState(false);

  const [targetUidObra, setTargetUidObra] = useState("");
  const [targetObraId, setTargetObraId] = useState("");
  const [linkingObra, setLinkingObra] = useState(false);
  const [unlinkingObra, setUnlinkingObra] = useState(false);

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
        description: "Obra registrada com sucesso.",
      });
    } catch (error) {
      toast({ title: "Sem permissão para criar", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleAdminCreateUser = async () => {
    try {
      setCreatingUser(true);
      const obras = novoObrasRaw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const result = await adminCreateUser({
        email: novoEmail,
        password: novaSenha,
        nome: novoNome,
        tipo: novoTipo,
        role: novoRole,
        obras,
      });

      toast({ title: "Usuário criado", description: `UID criado: ${result.uid}` });
      setNovoEmail("");
      setNovaSenha("");
      setNovoNome("");
      setNovoTipo("cliente");
      setNovoRole("cliente");
      setNovoObrasRaw("");
    } catch (error) {
      toast({ title: "Erro ao criar usuário", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleAdminSetRole = async () => {
    try {
      setUpdatingRole(true);
      await adminSetRole({
        uid: targetUidRole,
        role: targetRole,
        tipo: targetTipo,
        ativo: targetAtivo === "true",
      });
      toast({ title: "Permissões atualizadas", description: "Role/tipo/ativo atualizados com sucesso." });
    } catch (error) {
      toast({ title: "Erro ao atualizar role", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleAdminLinkObra = async () => {
    try {
      setLinkingObra(true);
      await adminLinkObra({ uid: targetUidObra, obraId: targetObraId });
      toast({ title: "Obra vinculada", description: "Vínculo realizado com sucesso." });
    } catch (error) {
      toast({ title: "Erro ao vincular obra", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLinkingObra(false);
    }
  };

  const handleAdminUnlinkObra = async () => {
    try {
      setUnlinkingObra(true);
      await adminUnlinkObra({ uid: targetUidObra, obraId: targetObraId });
      toast({ title: "Obra desvinculada", description: "Vínculo removido com sucesso." });
    } catch (error) {
      toast({ title: "Erro ao desvincular obra", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setUnlinkingObra(false);
    }
  };

  return (
    <ResponsiveLayout headerTitle="Cadastros" headerSubtitle="Obras e administração de usuários">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cadastro de obras</CardTitle>
            <CardDescription>Criação básica de obras no Firestore.</CardDescription>
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
            <CardTitle>Painel administrativo (Cloud Functions)</CardTitle>
            <CardDescription>
              Gestão de usuários via callable functions. Apenas usuários com role admin conseguem executar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isAdmin && (
              <p className="text-sm text-destructive">
                Seu usuário atual não é admin. As ações abaixo devem retornar permissão negada.
              </p>
            )}

            <div className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">Criar usuário</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="novo-email">Email</Label>
                  <Input id="novo-email" value={novoEmail} onChange={(event) => setNovoEmail(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="novo-password">Senha</Label>
                  <Input id="novo-password" type="password" value={novaSenha} onChange={(event) => setNovaSenha(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="novo-nome">Nome</Label>
                  <Input id="novo-nome" value={novoNome} onChange={(event) => setNovoNome(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={novoTipo} onValueChange={(value: UserType) => setNovoTipo(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPO_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={novoRole} onValueChange={(value: UserRole) => setNovoRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="novo-obras">Obras (csv de obraId, opcional)</Label>
                  <Input id="novo-obras" value={novoObrasRaw} onChange={(event) => setNovoObrasRaw(event.target.value)} />
                </div>
              </div>
              <Button onClick={() => void handleAdminCreateUser()} disabled={creatingUser}>
                {creatingUser ? "Criando usuário..." : "Criar usuário via Function"}
              </Button>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">Alterar role/tipo/ativo</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="target-uid-role">UID</Label>
                  <Input id="target-uid-role" value={targetUidRole} onChange={(event) => setTargetUidRole(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={targetRole} onValueChange={(value: UserRole) => setTargetRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={targetTipo} onValueChange={(value: UserType) => setTargetTipo(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPO_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Ativo</Label>
                  <Select value={targetAtivo} onValueChange={(value: "true" | "false") => setTargetAtivo(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">true</SelectItem>
                      <SelectItem value="false">false</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => void handleAdminSetRole()} disabled={updatingRole}>
                {updatingRole ? "Atualizando..." : "Atualizar role"}
              </Button>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">Vincular ou desvincular obra</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="target-uid-obra">UID</Label>
                  <Input id="target-uid-obra" value={targetUidObra} onChange={(event) => setTargetUidObra(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="target-obra-id">Obra ID</Label>
                  <Input id="target-obra-id" value={targetObraId} onChange={(event) => setTargetObraId(event.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleAdminLinkObra()} disabled={linkingObra}>
                  {linkingObra ? "Vinculando..." : "Vincular obra"}
                </Button>
                <Button variant="outline" onClick={() => void handleAdminUnlinkObra()} disabled={unlinkingObra}>
                  {unlinkingObra ? "Desvinculando..." : "Desvincular obra"}
                </Button>
              </div>
            </div>
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
                      <TooltipContent>Disponível quando fluxo completo de edição for habilitado.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ResponsiveLayout>
  );
};

export default StaffCadastrosPage;