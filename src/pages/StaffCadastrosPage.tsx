import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { ChevronDown, ChevronRight, Pencil, Plus, RefreshCw, X } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { CadastroObraForm } from "@/components/obra/CadastroObraForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { adminCreateUser, adminLinkObra, adminSetRole, adminUnlinkObra } from "@/lib/functions";
import { warnIfNotAdmin } from "@/lib/adminGuards";
import { toast } from "@/hooks/use-toast";
import type { UserRole, UserType } from "@/types/rbac";

const ROLE_OPTIONS: UserRole[] = ["admin", "gerente", "operacional", "cliente"];
const TIPO_OPTIONS: UserType[] = ["cliente", "funcionario"];

type AdminUser = {
  uid: string;
  nome: string;
  email: string;
  tipo: UserType;
  role: UserRole;
  ativo: boolean | null;
  obras: string[];
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

  return "Falha ao executar operacao.";
};

const isUserRole = (value: unknown): value is UserRole =>
  typeof value === "string" && ROLE_OPTIONS.includes(value as UserRole);

const isUserType = (value: unknown): value is UserType =>
  typeof value === "string" && TIPO_OPTIONS.includes(value as UserType);

const normalizeObras = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

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

const mapAdminUsers = (snapshot: Awaited<ReturnType<typeof loadUsers>>) => {
  const users = snapshot.docs
    .map((userDoc) => {
      const data = userDoc.data() as Record<string, unknown>;
      const uid = (typeof data.uid === "string" && data.uid.trim()) || userDoc.id;
      const nome = typeof data.nome === "string" && data.nome.trim() ? data.nome.trim() : uid;
      const email =
        (typeof data.email === "string" && data.email.trim()) ||
        (typeof data.emailLower === "string" && data.emailLower.trim()) ||
        "-";
      const role = isUserRole(data.role) ? data.role : "cliente";
      const tipo = isUserType(data.tipo) ? data.tipo : "cliente";
      const ativo = typeof data.ativo === "boolean" ? data.ativo : null;

      return {
        uid,
        nome,
        email,
        role,
        tipo,
        ativo,
        obras: normalizeObras(data.obras),
      };
    })
    .filter((user) => Boolean(user.uid));

  return users.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
};

const mapObraOptions = (snapshot: Awaited<ReturnType<typeof getDocs>>) => {
  const obras = snapshot.docs.map((obraDoc) => {
    const data = obraDoc.data() as { nome?: string; obraId?: string };
    const id = (typeof data.obraId === "string" && data.obraId.trim()) || obraDoc.id;
    const nome = typeof data.nome === "string" && data.nome.trim() ? data.nome.trim() : id;
    return { id, nome };
  });

  return obras.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
};

const formatStatus = (ativo: AdminUser["ativo"]) => {
  if (ativo === true) return "Ativo";
  if (ativo === false) return "Inativo";
  return "Nao informado";
};

type UsuariosCadastradosListProps = {
  users: AdminUser[];
  isLoading: boolean;
  onCreateUser: () => void;
  onEditUser: (user: AdminUser) => void;
  onRefresh: () => void;
};

const UsuariosCadastradosList = ({
  users,
  isLoading,
  onCreateUser,
  onEditUser,
  onRefresh,
}: UsuariosCadastradosListProps) => (
  <Card>
    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <CardTitle>Usuarios cadastrados</CardTitle>
        <CardDescription>Lista principal para gestao administrativa de acesso e obras vinculadas.</CardDescription>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" size="sm" className="gap-2" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
        <Button size="sm" className="gap-2" onClick={onCreateUser}>
          <Plus className="h-4 w-4" />
          Novo usuario
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Obras</TableHead>
            <TableHead className="text-right">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                Carregando usuarios...
              </TableCell>
            </TableRow>
          ) : users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                Nenhum usuario encontrado.
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.uid}>
                <TableCell className="font-medium">{user.nome}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.ativo === false ? "destructive" : "secondary"}>{formatStatus(user.ativo)}</Badge>
                </TableCell>
                <TableCell>{user.tipo}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>{user.obras.length}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => onEditUser(user)}>
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

type UsuarioCreateFormProps = {
  isAdmin: boolean;
  novoEmail: string;
  novaSenha: string;
  novoNome: string;
  novoTipo: UserType;
  novoRole: UserRole;
  novoObrasRaw: string;
  creatingUser: boolean;
  emailCheckMessage: string;
  emailCheckTone: "muted" | "warning";
  onClose: () => void;
  onNovoEmailChange: (value: string) => void;
  onNovoEmailBlur: () => void;
  setNovaSenha: (value: string) => void;
  setNovoNome: (value: string) => void;
  setNovoTipo: (value: UserType) => void;
  setNovoRole: (value: UserRole) => void;
  setNovoObrasRaw: (value: string) => void;
  onAdminCreateUser: () => Promise<void>;
};

const UsuarioCreateForm = ({
  isAdmin,
  novoEmail,
  novaSenha,
  novoNome,
  novoTipo,
  novoRole,
  novoObrasRaw,
  creatingUser,
  emailCheckMessage,
  emailCheckTone,
  onClose,
  onNovoEmailChange,
  onNovoEmailBlur,
  setNovaSenha,
  setNovoNome,
  setNovoTipo,
  setNovoRole,
  setNovoObrasRaw,
  onAdminCreateUser,
}: UsuarioCreateFormProps) => (
  <Card>
    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <CardTitle>Novo usuario</CardTitle>
        <CardDescription>Criacao via Cloud Function administrativa existente.</CardDescription>
      </div>
      <Button variant="ghost" size="sm" className="w-full gap-2 sm:w-auto" onClick={onClose}>
        <X className="h-4 w-4" />
        Fechar
      </Button>
    </CardHeader>
    <CardContent className="space-y-4">
      {!isAdmin && (
        <p className="text-sm text-destructive">
          Seu usuario atual nao e admin. A Cloud Function deve bloquear a operacao.
        </p>
      )}
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
        {creatingUser ? "Criando usuario..." : "Criar usuario via Function"}
      </Button>
    </CardContent>
  </Card>
);

type UsuarioEditPanelProps = {
  isAdmin: boolean;
  user: AdminUser;
  obras: ObraOption[];
  linkedObras: string[];
  targetRole: UserRole;
  targetTipo: UserType;
  targetAtivo: "true" | "false";
  updatingRole: boolean;
  selectedLinkObraId: string;
  linkStatus: LinkStatus;
  isLinkingObra: boolean;
  isUnlinkingObra: boolean;
  onClose: () => void;
  setTargetRole: (value: UserRole) => void;
  setTargetTipo: (value: UserType) => void;
  setTargetAtivo: (value: "true" | "false") => void;
  setSelectedLinkObraId: (value: string) => void;
  onAdminSetRole: () => Promise<void>;
  onLinkObra: () => Promise<void>;
  onUnlinkObra: (obraId?: string) => Promise<void>;
};

const UsuarioEditPanel = ({
  isAdmin,
  user,
  obras,
  linkedObras,
  targetRole,
  targetTipo,
  targetAtivo,
  updatingRole,
  selectedLinkObraId,
  linkStatus,
  isLinkingObra,
  isUnlinkingObra,
  onClose,
  setTargetRole,
  setTargetTipo,
  setTargetAtivo,
  setSelectedLinkObraId,
  onAdminSetRole,
  onLinkObra,
  onUnlinkObra,
}: UsuarioEditPanelProps) => {
  const obraNameById = useMemo(() => new Map(obras.map((obra) => [obra.id, obra.nome])), [obras]);
  const availableObras = obras.filter((obra) => !linkedObras.includes(obra.id));
  const canLink = Boolean(selectedLinkObraId) && linkStatus === "not_linked" && !isLinkingObra && !isUnlinkingObra;

  const statusMessage = (() => {
    switch (linkStatus) {
      case "checking":
        return "Verificando vinculo...";
      case "linked":
        return "Obra ja vinculada.";
      case "not_linked":
        return "Obra disponivel para vinculo.";
      case "error":
        return "Erro ao verificar vinculo.";
      default:
        return "Selecione uma obra para vincular.";
    }
  })();

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Editar usuario</CardTitle>
          <CardDescription>
            {user.nome} - {user.email}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="w-full gap-2 sm:w-auto" onClick={onClose}>
          <X className="h-4 w-4" />
          Fechar
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isAdmin && (
          <p className="text-sm text-destructive">
            Seu usuario atual nao e admin. As Cloud Functions devem retornar permissao negada.
          </p>
        )}

        <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">UID</p>
            <p className="break-all text-sm font-medium">{user.uid}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status atual</p>
            <p className="text-sm font-medium">{formatStatus(user.ativo)}</p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Dados administrativos</h3>
          <div className="grid gap-3 md:grid-cols-3">
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
            {updatingRole ? "Atualizando..." : "Salvar dados administrativos"}
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Obras vinculadas</h3>
          {linkedObras.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma obra vinculada a este usuario.</p>
          ) : (
            <div className="space-y-2">
              {linkedObras.map((obraId) => (
                <div key={obraId} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{obraNameById.get(obraId) ?? obraId}</p>
                    <p className="text-xs text-muted-foreground">{obraId}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void onUnlinkObra(obraId)}
                    disabled={isLinkingObra || isUnlinkingObra}
                  >
                    {isUnlinkingObra ? "Desvinculando..." : "Desvincular"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 pt-2 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1">
              <Label>Adicionar obra</Label>
              <Select value={selectedLinkObraId} onValueChange={setSelectedLinkObraId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar obra" />
                </SelectTrigger>
                <SelectContent>
                  {availableObras.map((obra) => (
                    <SelectItem key={obra.id} value={obra.id}>
                      {obra.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className={`text-xs ${linkStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>{statusMessage}</p>
            </div>
            <Button onClick={() => void onLinkObra()} disabled={!canLink}>
              {isLinkingObra ? "Vinculando..." : "Vincular obra"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StaffCadastrosPage = () => {
  const { userDoc } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = userDoc?.role === "admin";

  const [isObraCadastroOpen, setIsObraCadastroOpen] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);

  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<UserType>("cliente");
  const [novoRole, setNovoRole] = useState<UserRole>("cliente");
  const [novoObrasRaw, setNovoObrasRaw] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [emailCheckStatus, setEmailCheckStatus] = useState<EmailCheckStatus>("idle");
  const [emailCheckMessage, setEmailCheckMessage] = useState("");

  const [selectedEditingUid, setSelectedEditingUid] = useState("");
  const [targetRole, setTargetRole] = useState<UserRole>("cliente");
  const [targetTipo, setTargetTipo] = useState<UserType>("cliente");
  const [targetAtivo, setTargetAtivo] = useState<"true" | "false">("true");
  const [updatingRole, setUpdatingRole] = useState(false);
  const [selectedLinkObraId, setSelectedLinkObraId] = useState("");
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("idle");
  const [isLinkingObra, setIsLinkingObra] = useState(false);
  const [isUnlinkingObra, setIsUnlinkingObra] = useState(false);

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [obraOptions, setObraOptions] = useState<ObraOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  const loadOptions = useCallback(async () => {
    try {
      setIsLoadingOptions(true);
      const [usersSnapshot, obrasSnapshot] = await Promise.all([loadUsers(), getDocs(collection(db, "obras"))]);
      setAdminUsers(mapAdminUsers(usersSnapshot));
      setObraOptions(mapObraOptions(obrasSnapshot));
    } catch (error) {
      console.error("[painel-cadastros] erro ao carregar opcoes", error);
      toast({ title: "Erro ao carregar cadastros", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setIsLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const selectedUser = useMemo(
    () => adminUsers.find((user) => user.uid === selectedEditingUid) ?? null,
    [adminUsers, selectedEditingUid],
  );

  const handleObraCreated = async () => {
    const obrasSnapshot = await getDocs(collection(db, "obras"));
    setObraOptions(mapObraOptions(obrasSnapshot));
    setIsObraCadastroOpen(false);
  };

  const selectedUserObrasQuery = useQuery({
    queryKey: ["users", selectedEditingUid, "obras"],
    enabled: Boolean(selectedEditingUid),
    staleTime: 60_000,
    queryFn: async () => {
      const userRef = doc(db, "users", selectedEditingUid);
      const userSnapshot = await getDoc(userRef);
      const data = userSnapshot.data() as { obras?: unknown } | undefined;
      return { obras: normalizeObras(data?.obras) };
    },
  });

  const linkedObras = useMemo(
    () => selectedUserObrasQuery.data?.obras ?? selectedUser?.obras ?? [],
    [selectedUser?.obras, selectedUserObrasQuery.data?.obras],
  );

  useEffect(() => {
    if (!selectedEditingUid || !selectedLinkObraId) {
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

    const isLinked = linkedObras.includes(selectedLinkObraId);
    setLinkStatus(isLinked ? "linked" : "not_linked");
  }, [
    linkedObras,
    selectedEditingUid,
    selectedLinkObraId,
    selectedUserObrasQuery.isError,
    selectedUserObrasQuery.isFetching,
  ]);

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

      const snapshot = await getDocs(query(collection(db, "users"), where("email", "==", normalizedEmail), limit(1)));

      if (!snapshot.empty) {
        const userSnapshot = snapshot.docs[0];
        const data = userSnapshot.data() as { nome?: string; uid?: string };
        const identifier = data.nome?.trim() || data.uid?.trim() || userSnapshot.id;
        setEmailCheckStatus("exists");
        setEmailCheckMessage(`Usuario ja existe: ${identifier}`);
        return;
      }

      setEmailCheckStatus("available");
      setEmailCheckMessage("Email disponivel");
    } catch (error) {
      console.error("[painel-cadastros] erro ao verificar email", error);
      setEmailCheckStatus("error");
      setEmailCheckMessage("Nao foi possivel verificar o email agora.");
    }
  };

  useEffect(() => {
    if (!isCreateUserOpen) return undefined;

    const timeoutId = window.setTimeout(() => {
      void verifyEmailExists(novoEmail);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [isCreateUserOpen, novoEmail]);

  const openEditUser = (user: AdminUser) => {
    setSelectedEditingUid(user.uid);
    setTargetRole(user.role);
    setTargetTipo(user.tipo);
    setTargetAtivo(user.ativo === false ? "false" : "true");
    setSelectedLinkObraId("");
    setIsCreateUserOpen(false);
  };

  const handleAdminCreateUser = async () => {
    const email = normalizeEmail(novoEmail);
    const senha = novaSenha.trim();
    const nomeUsuario = novoNome.trim();

    if (!email || !senha || !nomeUsuario) {
      toast({
        title: "Campos obrigatorios",
        description: "Preencha email, senha e nome para criar o usuario.",
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

      toast({ title: "Usuario criado", description: `UID criado: ${result.uid}` });
      setNovoEmail("");
      setNovaSenha("");
      setNovoNome("");
      setNovoTipo("cliente");
      setNovoRole("cliente");
      setNovoObrasRaw("");
      setEmailCheckStatus("idle");
      setEmailCheckMessage("");
      setIsCreateUserOpen(false);
      await loadOptions();
    } catch (error) {
      toast({ title: "Erro ao criar usuario", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleAdminSetRole = async () => {
    const uid = selectedEditingUid.trim();
    if (!uid) {
      toast({
        title: "Usuario obrigatorio",
        description: "Selecione um usuario para atualizar role/tipo/ativo.",
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
      toast({ title: "Permissoes atualizadas", description: "Role/tipo/ativo atualizados com sucesso." });
      await loadOptions();
    } catch (error) {
      toast({ title: "Erro ao atualizar role", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleLinkObra = async () => {
    const uid = selectedEditingUid.trim();
    const obraId = selectedLinkObraId.trim();

    if (!uid || !obraId) {
      toast({
        title: "Campos obrigatorios",
        description: "Selecione usuario e obra para vincular.",
        variant: "destructive",
      });
      return;
    }

    warnIfNotAdmin(isAdmin);

    try {
      setIsLinkingObra(true);
      await adminLinkObra({ uid, obraId });
      toast({ title: "Obra vinculada", description: "A obra foi vinculada ao usuario com sucesso." });
      setSelectedLinkObraId("");
    } catch (error) {
      toast({ title: "Erro ao vincular obra", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setIsLinkingObra(false);
      await queryClient.invalidateQueries({ queryKey: ["users", uid, "obras"] });
      await loadOptions();
    }
  };

  const handleUnlinkObra = async (obraIdOverride?: string) => {
    const uid = selectedEditingUid.trim();
    const obraId = (obraIdOverride ?? selectedLinkObraId).trim();

    if (!uid || !obraId) {
      toast({
        title: "Campos obrigatorios",
        description: "Selecione usuario e obra para desvincular.",
        variant: "destructive",
      });
      return;
    }

    warnIfNotAdmin(isAdmin);

    try {
      setIsUnlinkingObra(true);
      await adminUnlinkObra({ uid, obraId });
      toast({ title: "Obra desvinculada", description: "A obra foi desvinculada do usuario com sucesso." });
      if (selectedLinkObraId === obraId) setSelectedLinkObraId("");
    } catch (error) {
      toast({ title: "Erro ao desvincular obra", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setIsUnlinkingObra(false);
      await queryClient.invalidateQueries({ queryKey: ["users", uid, "obras"] });
      await loadOptions();
    }
  };

  const emailCheckTone = useMemo<"muted" | "warning">(
    () => (emailCheckStatus === "exists" || emailCheckStatus === "error" ? "warning" : "muted"),
    [emailCheckStatus],
  );

  return (
    <ResponsiveLayout headerTitle="Cadastros" headerSubtitle="Obras e administracao de usuarios">
      <div className="space-y-4 px-4 py-6 lg:px-8 lg:py-8">
        <Collapsible open={isObraCadastroOpen} onOpenChange={setIsObraCadastroOpen}>
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Cadastro de obras</CardTitle>
                <CardDescription>Criacao basica de obras no Firestore.</CardDescription>
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

        <UsuariosCadastradosList
          users={adminUsers}
          isLoading={isLoadingOptions}
          onCreateUser={() => {
            setIsCreateUserOpen(true);
            setSelectedEditingUid("");
          }}
          onEditUser={openEditUser}
          onRefresh={() => void loadOptions()}
        />

        {isCreateUserOpen && (
          <UsuarioCreateForm
            isAdmin={isAdmin}
            novoEmail={novoEmail}
            novaSenha={novaSenha}
            novoNome={novoNome}
            novoTipo={novoTipo}
            novoRole={novoRole}
            novoObrasRaw={novoObrasRaw}
            creatingUser={creatingUser}
            emailCheckMessage={emailCheckMessage}
            emailCheckTone={emailCheckTone}
            onClose={() => setIsCreateUserOpen(false)}
            onNovoEmailChange={setNovoEmail}
            onNovoEmailBlur={() => void verifyEmailExists(novoEmail)}
            setNovaSenha={setNovaSenha}
            setNovoNome={setNovoNome}
            setNovoTipo={setNovoTipo}
            setNovoRole={setNovoRole}
            setNovoObrasRaw={setNovoObrasRaw}
            onAdminCreateUser={handleAdminCreateUser}
          />
        )}

        {selectedUser && (
          <UsuarioEditPanel
            isAdmin={isAdmin}
            user={selectedUser}
            obras={obraOptions}
            linkedObras={linkedObras}
            targetRole={targetRole}
            targetTipo={targetTipo}
            targetAtivo={targetAtivo}
            updatingRole={updatingRole}
            selectedLinkObraId={selectedLinkObraId}
            linkStatus={linkStatus}
            isLinkingObra={isLinkingObra}
            isUnlinkingObra={isUnlinkingObra}
            onClose={() => {
              setSelectedEditingUid("");
              setSelectedLinkObraId("");
            }}
            setTargetRole={setTargetRole}
            setTargetTipo={setTargetTipo}
            setTargetAtivo={setTargetAtivo}
            setSelectedLinkObraId={setSelectedLinkObraId}
            onAdminSetRole={handleAdminSetRole}
            onLinkObra={handleLinkObra}
            onUnlinkObra={handleUnlinkObra}
          />
        )}
      </div>
    </ResponsiveLayout>
  );
};

export default StaffCadastrosPage;
