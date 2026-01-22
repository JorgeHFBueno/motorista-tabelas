import { Home, Building2, Wallet, Newspaper, MessageSquare, FileText, Camera, X, ChevronUp, Check } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useObra } from "@/contexts/ObraContext";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MobileNavProps {
  onClose: () => void;
}

const navItems = [
  { icon: Home, label: "Início", path: "/" },
  { icon: Building2, label: "Obra", path: "/obra" },
  { icon: Wallet, label: "Finanças", path: "/financas" },
  { icon: FileText, label: "Documentos", path: "/documentos" },
  { icon: Camera, label: "Fotos", path: "/fotos" },
  { icon: Newspaper, label: "Notícias", path: "/noticias" },
  { icon: MessageSquare, label: "Suporte", path: "/atendimento" },
];

const MobileNav = ({ onClose }: MobileNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { obraAtiva, obras, setObraAtiva } = useObra();
  const [selectorOpen, setSelectorOpen] = useState(false);

  const handleNavigation = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleObraSelect = (obra: typeof obraAtiva) => {
    setObraAtiva(obra);
    setSelectorOpen(false);
  };

  return (
    <div className="flex flex-col h-full text-primary-foreground">
      {/* Header */}
      <div className="p-6 border-b border-primary-foreground/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
            <span className="text-secondary-foreground text-lg font-bold">L</span>
          </div>
          <div>
            <h1 className="font-semibold text-lg">Ledur</h1>
            <p className="text-xs text-primary-foreground/60">Pré-Fabricados</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <button
                  onClick={() => handleNavigation(item.path)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-left",
                    isActive
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-sm">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Seletor de Obra Ativa - Menu Contextual */}
      <div className="p-4 border-t border-primary-foreground/10">
        <Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
          <PopoverTrigger asChild>
            <button className="w-full bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg p-3 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-primary-foreground/60 mb-1">Obra ativa</p>
                  <p className="text-sm font-medium truncate">{obraAtiva.nome}</p>
                </div>
                <ChevronUp className={cn(
                  "w-4 h-4 text-primary-foreground/60 transition-transform duration-200",
                  selectorOpen && "rotate-180"
                )} />
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent 
            side="top" 
            align="start" 
            className="w-[280px] p-2 bg-background border-border"
            sideOffset={8}
          >
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground px-2 py-1.5">Selecione a obra</p>
              {obras.map((obra) => {
                const isSelected = obra.id === obraAtiva.id;
                return (
                  <button
                    key={obra.id}
                    onClick={() => handleObraSelect(obra)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{obra.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{obra.endereco}</p>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default MobileNav;
