import { Bell, User, ChevronDown, Menu, LogOut, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { sendPasswordResetEmail } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import MobileNav from "./MobileNav";
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
import { auth } from "@/lib/firebase";
import { userUpdateSelfProfile } from "@/lib/functions";

interface ResponsiveHeaderProps {
  pageTitle?: string;
  pageSubtitle?: string;
}

const ResponsiveHeader = ({ 
  pageTitle,
  pageSubtitle,
}: ResponsiveHeaderProps) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const { obraAtiva } = useObra();
  const { logout, userDoc, refreshUserDoc } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const obraNome = obraAtiva?.nome ?? "Nenhuma obra selecionada";

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
      await userUpdateSelfProfile({ nome: trimmedNome });
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
      <div className="lg:hidden px-4 pt-12 pb-5">
        <div className="flex items-center justify-between">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 px-3 py-2 rounded-lg transition-colors"
          >
            <div className="w-7 h-7 bg-secondary rounded flex items-center justify-center">
              <span className="text-secondary-foreground text-xs font-bold">L</span>
            </div>
            <span className="font-medium text-sm max-w-[140px] truncate">{obraNome}</span>
            <ChevronDown className="w-4 h-4 opacity-60" />
          </motion.button>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1.5"
          >
            <button className="relative p-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-secondary rounded-full" />
            </button>
            <button className="p-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
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
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <button className="p-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-primary p-0 border-0">
              <MobileNav onClose={() => setIsMobileMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
              <span className="text-secondary-foreground text-lg font-bold">L</span>
            </div>
            <div>
              <h1 className="font-semibold">Ledur Pré-Fabricados</h1>
              <p className="text-xs text-primary-foreground/60">{obraNome}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="relative p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full" />
          </button>
          <button className="p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
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
      <div className="hidden lg:flex px-8 py-4 items-center justify-between border-b border-primary-foreground/10">
        <div>
          {pageTitle ? (
            <div>
              <h1 className="text-xl font-semibold">{pageTitle}</h1>
              {pageSubtitle && (
                <p className="text-sm text-primary-foreground/70">{pageSubtitle}</p>
              )}
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-semibold">Dashboard</h1>
              <p className="text-sm text-primary-foreground/70">Visão geral da sua obra</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button className="relative p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full" />
          </button>
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
                <p className="text-sm text-muted-foreground mb-1">Tipo</p>
                <p className="text-sm font-medium">{userDoc.tipo}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Obras</p>
                <div className="flex flex-wrap gap-2">
                  {userDoc.obras.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Sem obras vinculadas.</span>
                  ) : (
                    userDoc.obras.map((obraId) => <Badge key={obraId} variant="secondary">{obraId}</Badge>)
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
