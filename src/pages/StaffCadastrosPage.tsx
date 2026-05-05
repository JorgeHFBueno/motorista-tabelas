import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { ChevronDown, ChevronRight } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CadastroObraForm } from "@/components/obra/CadastroObraForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { adminCreateUser, adminLinkObra, adminSetRole, adminUnlinkObra } from "@/lib/functions";
import { warnIfNotAdmin } from "@/lib/adminGuards";
import { toast } from "@/hooks/use-toast";
import type { UserRole, UserType } from "@/types/rbac";

const ROLE_OPTIONS: UserRole[] = ["admin", "gerente", "operacional", "cliente"];
const TIPO_OPTIONS: UserType[] = ["cliente", "funcionario"];
const PLACEHOLDER_MESSAGE = "Função indisponível nesta versão (aguardando aprovação/implementação).";

type UserOption = {
  uid: string;
  nome: string;
};

type ObraOption = {
  id: string;
  nome: string;
};

type EmailCheckStatus = "idle" | "loading" | "exists" | "available" | "error";
type LinkStatus = "idle" | "checking" | "linked" | "not_linked" | "error";

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  const maybeError = error as { message?: string };
  if (typeof maybeError?.message === "string") return maybeError.message;

  return "Falha ao executar operação.";
};

const loadUsers = async () => {
  const usersCollection = collection(db, "users");

  try {
    const snapshot = await getDocs(query(usersCollection, orderBy("nome")));
    return snapshot;
  } catch (error) {
    console.warn("[painel-cadastros] fallback de listagem de users sem orderBy(nome)", error);
    return getDocs(usersCollection);
  }
};

const mapUserOptions = (snapshot: Awaited<ReturnType<typeof loadUsers>>) => {
  const users = snapshot.docs
    .map((doc) => {
      const data = doc.data() as { uid?: string; nome?: string };
      const uid = (typeof data.uid === "string" && data.uid.trim()) || doc.id;
      const nome = typeof data.nome === "string" && data.nome.trim() ? data.nome.trim() : uid;

      return { uid, nome };
    })
    .filter((user) => Boolean(user.uid));

  return users.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
};

const mapObraOptions = (snapshot: Awaited<ReturnType<typeof getDocs>>) => {
  const obras = snapshot.docs.map((doc) => {
    const data = doc.data() as { nome?: string; obraId?: string };
    const id = (typeof data.obraId === "string" && data.obraId.trim()) || doc.id;
    const nome = typeof data.nome === "string" && data.nome.trim() ? data.nome.trim() : id;
    return { id, nome };
  });

  return obras.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
};

type VincularDesvincularObraCardProps = {
  isAdmin: boolean;
  users: UserOption[];
  obras: ObraOption[];
  selectedUid: string;
  selectedObraId: string;
  status: LinkStatus;
  isLinking: boolean;
  isUnlinking: boolean;
  onSelectUid: (value: string) => void;
  onSelectObraId: (value: string) => void;
  onLinkObra: () => Promise<void>;
  onUnlinkObra: () => Promise<void>;
};

const VincularDesvincularObraCard = ({
  isAdmin,
  users,
  obras,
  selectedUid,
  selectedObraId,
  status,
  isLinking,
  isUnlinking,
  onSelectUid,
  onSelectObraId,
  onLinkObra,
  onUnlinkObra,
}: VincularDesvincularObraCardProps) => {
  const canLink = Boolean(selectedUid && selectedObraId) && status === "not_linked" && !isLinking && !isUnlinking;
  const canUnlink = Boolean(selectedUid && selectedObraId) && status === "linked" && !isLinking && !isUnlinking;

  const statusMessage = (() => {
    switch (status) {
      case "checking":
        return "Verificando...";
      case "linked":
        return "Vinculado";
      case "not_linked":
        return "Não vinculado";
      case "error":
        return "Erro ao verificar vínculo.";
      default:
        return "Selecione usuário e obra";
    }
  })();

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Vincular ou desvincular obra</h3>
      {!isAdmin && <p className="text-xs text-muted-foreground">Ação administrativa: o backend valida permissões.</p>}
      <p className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{statusMessage}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>UID</Label>
          <Select value={selectedUid} onValueChange={onSelectUid}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar usuário" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.uid} value={user.uid}>
                  {user.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Obra ID</Label>
          <Select value={selectedObraId} onValueChange={onSelectObraId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar obra" />
            </SelectTrigger>
            <SelectContent>
              {obras.map((obra) => (
                <SelectItem key={obra.id} value={obra.id}>
                  {obra.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void onLinkObra()} disabled={!canLink}>
          {isLinking ? "Vinculando..." : "Vincular obra"}
        </Button>
        <Button variant="outline" onClick={() => void onUnlinkObra()} disabled={!canUnlink}>
          {isUnlinking ? "Desvinculando..." : "Desvincular obra"}
        </Button>
      </div>
    </div>
     );
};

type AdminFunctionsCardProps = {
  isAdmin: boolean;
  users: UserOption[];
  obras: ObraOption[];
  novoEmail: string;
  novaSenha: string;
  novoNome: string;
  novoTipo: UserType;
  novoRole: UserRole;
  novoObrasRaw: string;
  creatingUser: boolean;
  targetUidRole: string;
  targetRole: UserRole;
  targetTipo: UserType;
  targetAtivo: "true" | "false";
  updatingRole: boolean;
  emailCheckMessage: string;
  emailCheckTone: "muted" | "warning";
  onNovoEmailChange: (value: string) => void;
  onNovoEmailBlur: () => void;
  setNovaSenha: (value: string) => void;
  setNovoNome: (value: string) => void;
  setNovoTipo: (value: UserType) => void;
  setNovoRole: (value: UserRole) => void;
  setNovoObrasRaw: (value: string) => void;
  setTargetUidRole: (value: string) => void;
  setTargetRole: (value: UserRole) => void;
  setTargetTipo: (value: UserType) => void;
  setTargetAtivo: (value: "true" | "false") => void;
  selectedLinkUid: string;
  selectedLinkObraId: string;
  linkStatus: LinkStatus;
  isLinkingObra: boolean;
  isUnlinkingObra: boolean;
  setSelectedLinkUid: (value: string) => void;
  setSelectedLinkObraId: (value: string) => void;
  onLinkObra: () => Promise<void>;
  onUnlinkObra: () => Promise<void>;
  onAdminCreateUser: () => Promise<void>;
  onAdminSetRole: () => Promise<void>;
};

const AdminFunctionsCard = ({
  isAdmin,
  users,
  obras,
  novoEmail,
  novaSenha,
  novoNome,
  novoTipo,
  novoRole,
  novoObrasRaw,
  creatingUser,
  targetUidRole,
  targetRole,
  targetTipo,
  targetAtivo,
  updatingRole,
  emailCheckMessage,
  emailCheckTone,
  onNovoEmailChange,
  onNovoEmailBlur,
  setNovaSenha,
  setNovoNome,
  setNovoTipo,
  setNovoRole,
  setNovoObrasRaw,
  setTargetUidRole,
  setTargetRole,
  setTargetTipo,
  setTargetAtivo,
  selectedLinkUid,
  selectedLinkObraId,
  linkStatus,
  isLinkingObra,
  isUnlinkingObra,
  setSelectedLinkUid,
  setSelectedLinkObraId,
  onLinkObra,
  onUnlinkObra,
  onAdminCreateUser,
  onAdminSetRole,
}: AdminFunctionsCardProps) => (
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
            <Input
              id="novo-email"
              value={novoEmail}
              onBlur={onNovoEmailBlur}
              onChange={(event) => onNovoEmailChange(event.target.value)}
            />
            {emailCheckMessage && (
              <p className={`text-xs ${emailCheckTone === "warning" ? "text-destructive" : "text-muted-foreground"}`}>
                {emailCheckMessage}
              </p>
            )}
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
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
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
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="novo-obras">Obras (csv de obraId, opcional)</Label>
            <Input id="novo-obras" value={novoObrasRaw} onChange={(event) => setNovoObrasRaw(event.target.value)} />
          </div>
        </div>
        <Button onClick={() => void onAdminCreateUser()} disabled={creatingUser}>
          {creatingUser ? "Criando usuário..." : "Criar usuário via Function"}
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">Alterar role/tipo/ativo</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>UID</Label>
            <Select value={targetUidRole} onValueChange={setTargetUidRole}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar usuário" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.uid} value={user.uid}>
                    {user.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={targetRole} onValueChange={(value: UserRole) => setTargetRole(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
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
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
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
        <Button onClick={() => void onAdminSetRole()} disabled={updatingRole}>
          {updatingRole ? "Atualizando..." : "Atualizar role"}
        </Button>
      </div>

      <VincularDesvincularObraCard
        isAdmin={isAdmin}
        users={users}
        obras={obras}
        selectedUid={selectedLinkUid}
        selectedObraId={selectedLinkObraId}
        status={linkStatus}
        isLinking={isLinkingObra}
        isUnlinking={isUnlinkingObra}
        onSelectUid={setSelectedLinkUid}
        onSelectObraId={setSelectedLinkObraId}
        onLinkObra={onLinkObra}
        onUnlinkObra={onUnlinkObra}
      />
    </CardContent>
  </Card>
);

const ObrasVinculadasCard = () => (
  <Card>
    <CardHeader>
      <CardTitle>Obras vinculadas ao seu acesso</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <Input placeholder="Buscar por nome/descrição" disabled value="" readOnly />
      <p className="text-sm text-amber-600">{PLACEHOLDER_MESSAGE}</p>
      <p className="text-sm text-muted-foreground">Nenhuma obra encontrada.</p>
    </CardContent>
  </Card>
);

const StaffCadastrosPage = () => {
  const { userDoc } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = userDoc?.role === "admin";

  const [isObraCadastroOpen, setIsObraCadastroOpen] = useState(false);

  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<UserType>("cliente");
  const [novoRole, setNovoRole] = useState<UserRole>("cliente");
  const [novoObrasRaw, setNovoObrasRaw] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [emailCheckStatus, setEmailCheckStatus] = useState<EmailCheckStatus>("idle");
  const [emailCheckMessage, setEmailCheckMessage] = useState("");

  const [targetUidRole, setTargetUidRole] = useState("");
  const [targetRole, setTargetRole] = useState<UserRole>("cliente");
  const [targetTipo, setTargetTipo] = useState<UserType>("cliente");
  const [targetAtivo, setTargetAtivo] = useState<"true" | "false">("true");
  const [updatingRole, setUpdatingRole] = useState(false);
  const [selectedLinkUid, setSelectedLinkUid] = useState("");
  const [selectedLinkObraId, setSelectedLinkObraId] = useState("");
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("idle");
  const [isLinkingObra, setIsLinkingObra] = useState(false);
  const [isUnlinkingObra, setIsUnlinkingObra] = useState(false);

  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [obraOptions, setObraOptions] = useState<ObraOption[]>([]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [usersSnapshot, obrasSnapshot] = await Promise.all([
          loadUsers(),
          getDocs(collection(db, "obras")),
        ]);
        setUserOptions(mapUserOptions(usersSnapshot));
        setObraOptions(mapObraOptions(obrasSnapshot));
      } catch (error) {
        console.error("[painel-cadastros] erro ao carregar opções", error);
      }
    };

    void loadOptions();
  }, []);

  const handleObraCreated = async () => {
    const obrasSnapshot = await getDocs(collection(db, "obras"));
    setObraOptions(mapObraOptions(obrasSnapshot));
    setIsObraCadastroOpen(false);
  };

  const selectedUserObrasQuery = useQuery({
    queryKey: ["users", selectedLinkUid, "obras"],
    enabled: Boolean(selectedLinkUid),
    staleTime: 60_000,
    queryFn: async () => {
      const userRef = doc(db, "users", selectedLinkUid);
      const userSnapshot = await getDoc(userRef);
      const data = userSnapshot.data() as { obras?: unknown } | undefined;
      const obras = Array.isArray(data?.obras) ? data.obras.filter((obra): obra is string => typeof obra === "string") : [];
      return { obras };
    },
  });

  useEffect(() => {
    if (!selectedLinkUid || !selectedLinkObraId) {
      setLinkStatus("idle");
      return;
    }

    if (selectedUserObrasQuery.isFetching) {
      setLinkStatus("checking");
      return;
    }

    if (selectedUserObrasQuery.isError) {
      setLinkStatus("error");
      return;
    }

    const isLinked = selectedUserObrasQuery.data?.obras.includes(selectedLinkObraId) ?? false;
    setLinkStatus(isLinked ? "linked" : "not_linked");
  }, [selectedLinkObraId, selectedLinkUid, selectedUserObrasQuery.data, selectedUserObrasQuery.isError, selectedUserObrasQuery.isFetching]);

  const verifyEmailExists = async (value: string) => {
    const normalizedEmail = normalizeEmail(value);

    if (!normalizedEmail) {
      setEmailCheckStatus("idle");
      setEmailCheckMessage("");
      return;
    }

    try {
      setEmailCheckStatus("loading");
      setEmailCheckMessage("Verificando email...");

      const snapshot = await getDocs(
        query(collection(db, "users"), where("email", "==", normalizedEmail), limit(1)),
      );

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data() as { nome?: string; uid?: string };
        const identifier = data.nome?.trim() || data.uid?.trim() || doc.id;
        setEmailCheckStatus("exists");
        setEmailCheckMessage(`Usuário já existe: ${identifier}`);
        return;
      }

      setEmailCheckStatus("available");
      setEmailCheckMessage("Email disponível");
    } catch (error) {
      console.error("[painel-cadastros] erro ao verificar email", error);
      setEmailCheckStatus("error");
      setEmailCheckMessage("Não foi possível verificar o email agora.");
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void verifyEmailExists(novoEmail);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [novoEmail]);

    const handleAdminCreateUser = async () => {
      const email = normalizeEmail(novoEmail);
      const senha = novaSenha.trim();
      const nomeUsuario = novoNome.trim();

      if (!email || !senha || !nomeUsuario) {
        toast({
          title: "Campos obrigatórios",
          description: "Preencha email, senha e nome para criar o usuário.",
          variant: "destructive",
        });
        return;
      }

      warnIfNotAdmin(isAdmin);

      try {
        setCreatingUser(true);
        const obras = novoObrasRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

        const result = await adminCreateUser({
          email,
          password: senha,
          nome: nomeUsuario,
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
        setEmailCheckStatus("idle");
        setEmailCheckMessage("");
      } catch (error) {
        toast({ title: "Erro ao criar usuário", description: getErrorMessage(error), variant: "destructive" });
      } finally {
        setCreatingUser(false);
      }
    };

    const handleAdminSetRole = async () => {
      const uid = targetUidRole.trim();
      if (!uid) {
        toast({
          title: "UID obrigatório",
          description: "Selecione um usuário para atualizar role/tipo/ativo.",
          variant: "destructive",
        });
        return;
      }

      warnIfNotAdmin(isAdmin);

      try {
        setUpdatingRole(true);
        await adminSetRole({
          uid,
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

    const handleLinkObra = async () => {
      const uid = selectedLinkUid.trim();
      const obraId = selectedLinkObraId.trim();

      if (!uid || !obraId) {
        toast({
          title: "Campos obrigatórios",
          description: "Selecione usuário e obra para vincular.",
          variant: "destructive",
        });
        return;
      }

      warnIfNotAdmin(isAdmin);

      try {
        setIsLinkingObra(true);
        await adminLinkObra({ uid, obraId });
        toast({ title: "Obra vinculada", description: "A obra foi vinculada ao usuário com sucesso." });
      } catch (error) {
        toast({ title: "Erro ao vincular obra", description: getErrorMessage(error), variant: "destructive" });
      } finally {
        setIsLinkingObra(false);
        await queryClient.invalidateQueries({ queryKey: ["users", uid, "obras"] });
      }
    };

    const handleUnlinkObra = async () => {
      const uid = selectedLinkUid.trim();
      const obraId = selectedLinkObraId.trim();

      if (!uid || !obraId) {
        toast({
          title: "Campos obrigatórios",
          description: "Selecione usuário e obra para desvincular.",
          variant: "destructive",
        });
        return;
      }

      warnIfNotAdmin(isAdmin);

      try {
        setIsUnlinkingObra(true);
        await adminUnlinkObra({ uid, obraId });
        toast({ title: "Obra desvinculada", description: "A obra foi desvinculada do usuário com sucesso." });
      } catch (error) {
        toast({ title: "Erro ao desvincular obra", description: getErrorMessage(error), variant: "destructive" });
      } finally {
        setIsUnlinkingObra(false);
        await queryClient.invalidateQueries({ queryKey: ["users", uid, "obras"] });
      }
    };

    const emailCheckTone = useMemo<"muted" | "warning">(
      () => (emailCheckStatus === "exists" || emailCheckStatus === "error" ? "warning" : "muted"),
      [emailCheckStatus],
    );

    return (
      <ResponsiveLayout headerTitle="Cadastros" headerSubtitle="Obras e administração de usuários">
        <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
          <Collapsible open={isObraCadastroOpen} onOpenChange={setIsObraCadastroOpen}>
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Cadastro de obras</CardTitle>
                  <CardDescription>Criação básica de obras no Firestore.</CardDescription>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full gap-2 sm:w-auto">
                    {isObraCadastroOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {isObraCadastroOpen ? "Recolher" : "Expandir"}
                  </Button>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <CadastroObraForm onSuccess={handleObraCreated} />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <AdminFunctionsCard
            isAdmin={isAdmin}
            users={userOptions}
            obras={obraOptions}
            novoEmail={novoEmail}
            novaSenha={novaSenha}
            novoNome={novoNome}
            novoTipo={novoTipo}
            novoRole={novoRole}
            novoObrasRaw={novoObrasRaw}
            creatingUser={creatingUser}
            targetUidRole={targetUidRole}
            targetRole={targetRole}
            targetTipo={targetTipo}
            targetAtivo={targetAtivo}
            updatingRole={updatingRole}
            emailCheckMessage={emailCheckMessage}
            emailCheckTone={emailCheckTone}
            onNovoEmailChange={setNovoEmail}
            onNovoEmailBlur={() => void verifyEmailExists(novoEmail)}
            setNovaSenha={setNovaSenha}
            setNovoNome={setNovoNome}
            setNovoTipo={setNovoTipo}
            setNovoRole={setNovoRole}
            setNovoObrasRaw={setNovoObrasRaw}
            setTargetUidRole={setTargetUidRole}
            setTargetRole={setTargetRole}
            setTargetTipo={setTargetTipo}
            setTargetAtivo={setTargetAtivo}
            selectedLinkUid={selectedLinkUid}
            selectedLinkObraId={selectedLinkObraId}
            linkStatus={linkStatus}
            isLinkingObra={isLinkingObra}
            isUnlinkingObra={isUnlinkingObra}
            setSelectedLinkUid={setSelectedLinkUid}
            setSelectedLinkObraId={setSelectedLinkObraId}
            onLinkObra={handleLinkObra}
            onUnlinkObra={handleUnlinkObra}
            onAdminCreateUser={handleAdminCreateUser}
            onAdminSetRole={handleAdminSetRole}
          />

          <ObrasVinculadasCard />
        </div>
      </ResponsiveLayout>
    );
  };

  export default StaffCadastrosPage;
