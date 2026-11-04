import { Building2, Camera, ChevronLeft, FileText, House, LifeBuoy, Newspaper, Wallet } from "lucide-react";
import logoLedurBranco from "@/assets/logo-ledur-branco.png";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: House, label: "Dashboard", path: "/" },
  { icon: Building2, label: "Obra", path: "/obra" },
  { icon: Wallet, label: "Finanças", path: "/financas" },
  { icon: FileText, label: "Documentos", path: "/documentos" },
  { icon: Camera, label: "Fotos", path: "/fotos" },
  { icon: Newspaper, label: "Notícias", path: "/noticias" },
  { icon: LifeBuoy, label: "Atendimento", path: "/atendimento" },
];

// Side menu opened by the ☰ button on every screen size (same model as the main WEB).
const MenuLateral = ({ onClose }: { onClose: () => void }) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="flex h-full flex-col bg-primary text-primary-foreground">
      <div className="flex items-center justify-between border-b border-primary-foreground/10 p-6">
        <img src={logoLedurBranco} alt="Ledur Pré-Fabricados" className="h-10 w-auto" />
        <button
          onClick={onClose}
          aria-label="Fechar menu"
          className="-mr-2 rounded-lg p-2 text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 p-4" aria-label="Menu principal">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <button
                  onClick={() => {
                    navigate(item.path);
                    onClose();
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "w-full rounded-lg px-4 py-3 text-left transition-all duration-200 flex items-center gap-3",
                    isActive
                      ? "bg-secondary font-medium text-secondary-foreground"
                      : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-sm">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
};

export default MenuLateral;
