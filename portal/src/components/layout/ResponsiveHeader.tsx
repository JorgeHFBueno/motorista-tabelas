import { User, ChevronDown, LogOut, Loader2 } from "lucide-react";
import logoLedurBranco from "@/assets/logo-ledur-branco.png";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import AbasNavegacao from "./AbasNavegacao";
import NotificationBell from "./NotificationBell";
import ContratoSelector from "./ContratoSelector";
import { useObra } from "@/contexts/ObraContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";

interface ResponsiveHeaderProps {
  pageTitle?: string;
  pageSubtitle?: string;
}

const ResponsiveHeader = ({
  pageTitle,
  pageSubtitle,
}: ResponsiveHeaderProps) => {
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const { contratos } = useObra();
  const { logout, user, userDoc, refreshUserDoc } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const currentEmail = auth?.currentUser?.email ?? userDoc?.email ?? null;

  useEffect(() => {
    if (isUserDialogOpen) {
      setNome(userDoc?.nome ?? "");
    }
  }, [isUserDialogOpen, userDoc?.nome]);

  const trimmedNome = nome.trim();
  const canSave = useMemo(() => {
    if (!userDoc) {
      return false;
    }

    return trimmedNome.length >= 2 && trimmedNome !== (userDoc.nome ?? "").trim();
  }, [trimmedNome, userDoc]);

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const handleSaveUser = async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    try {
      if (!user) throw new Error("Sessão expirada. Entre novamente.");
      // The Rules let the client change only nome, with the server time.
      await updateDoc(doc(db, "users", user.uid), { nome: trimmedNome, atualizadoEm: serverTimestamp() });
      await refreshUserDoc();
      toast({ title: "Perfil atualizado", description: "Seu nome foi atualizado com sucesso." });
      setIsUserDialogOpen(false);
    } catch (error) {
      toast({
        title: "Falha ao salvar perfil",
        description: error instanceof Error ? error.message : "Erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth || !currentEmail) {
      return;
    }

    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, currentEmail);
      toast({ title: "Email enviado", description: "Verifique sua caixa de entrada para redefinir a senha." });
    } catch (error) {
      toast({
        title: "Falha ao enviar email",
        description: error instanceof Error ? error.message : "Erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <header className="bg-primary text-primary-foreground">
      {/* Mobile Header */}
      <div className="md:hidden px-4 pt-12 pb-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex min-w-0 items-center gap-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 px-3 py-2 rounded-lg transition-colors"
            >
              <ContratoSelector nameClassName="max-w-[120px]" />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1.5"
          >
            <NotificationBell className="p-2" />
            <button
              aria-label="Meu usuário"
              onClick={() => setIsUserDialogOpen(true)}
              className="p-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors"
            >
              <User className="w-5 h-5" />
            </button>
            <button
              className="p-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors"
              onClick={handleSignOut}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </div>

      {/* Tablet Header (md to lg) */}
      <div className="hidden md:flex lg:hidden px-6 py-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <img src={logoLedurBranco} alt="Ledur Pré-Fabricados" className="h-8 w-auto" />
            <ContratoSelector className="text-primary-foreground/80" nameClassName="text-xs max-w-[220px]" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            aria-label="Meu usuário"
            onClick={() => setIsUserDialogOpen(true)}
            className="p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors"
          >
            <User className="w-5 h-5" />
          </button>
          <button
            className="p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors"
            onClick={handleSignOut}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex px-8 pt-4 pb-2 items-center justify-between">
        <div className="flex items-center gap-4">
          <img src={logoLedurBranco} alt="Ledur Pré-Fabricados" className="h-9 w-auto" />
          {pageTitle ? (
            <div className="border-l border-primary-foreground/20 pl-4">
              <h1 className="text-xl font-semibold">{pageTitle}</h1>
              {pageSubtitle && (
                <p className="text-sm text-primary-foreground/70">{pageSubtitle}</p>
              )}
            </div>
          ) : (
            <div className="border-l border-primary-foreground/20 pl-4">
              <h1 className="text-xl font-semibold">Início</h1>
              <p className="text-sm text-primary-foreground/70">Visão geral da sua obra</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <ContratoSelector
            className="p-2 px-3 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors"
            nameClassName="max-w-[260px]"
          />
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 p-2 px-3 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
                <User className="w-5 h-5" />
                <span className="text-sm font-medium">{userDoc?.nome ?? "(sem nome)"}</span>
                <ChevronDown className="w-4 h-4 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsUserDialogOpen(true)}>Meu usuário</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <AbasNavegacao />
      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meu usuário</DialogTitle>
            <DialogDescription>
              Atualize somente o seu nome. Demais dados são controlados pela equipe administrativa.
            </DialogDescription>
          </DialogHeader>

          {!userDoc ? (
            <p className="text-sm text-muted-foreground">Perfil não carregado. Tente novamente em instantes.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Email</p>
                <p className="text-sm font-medium">{currentEmail ?? "Email indisponível"}</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground">Nome</p>
                <Input value={nome} onChange={(event) => setNome(event.target.value)} maxLength={80} />
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Obras</p>
                <div className="flex flex-wrap gap-2">
                  {contratos.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Nenhuma obra publicada.</span>
                  ) : (
                    contratos.map((contrato) => <Badge key={contrato.id} variant="secondary">{contrato.nome}</Badge>)
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSaveUser} disabled={!canSave || isSaving || !userDoc}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handlePasswordReset}
              disabled={!currentEmail || !userDoc || isSendingReset}
            >
              {isSendingReset && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Alterar senha
            </Button>
          </DialogFooter>
          {!currentEmail && <p className="text-xs text-muted-foreground">Não foi possível identificar o email do usuário logado.</p>}
        </DialogContent>
      </Dialog>
    </header>
  );
};

export default ResponsiveHeader;
