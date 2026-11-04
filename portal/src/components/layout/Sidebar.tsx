import { Building2, Camera, FileText, FolderCog, House, LifeBuoy, Newspaper, Wallet } from "lucide-react";
import logoLedurBranco from "@/assets/logo-ledur-branco.png";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userDoc } = useAuth();

  const navItems = userDoc?.role === "cliente"
    ? [
        { icon: House, label: "Dashboard", path: "/cliente" },
        { icon: Building2, label: "Obra", path: "/cliente/obra" },
        { icon: Wallet, label: "Finanças", path: "/cliente/financas" },
        { icon: FileText, label: "Documentos", path: "/cliente/documentos" },
        { icon: Camera, label: "Fotos", path: "/cliente/fotos" },
        { icon: Newspaper, label: "Notícias", path: "/cliente/noticias" },
        { icon: LifeBuoy, label: "Atendimento", path: "/cliente/atendimento" },
      ]
    : [
        { icon: Building2, label: "Obras", path: "/painel/obras" },
        { icon: LifeBuoy, label: "Atendimento", path: "/painel/atendimento" },
        { icon: FolderCog, label: "Cadastros", path: "/painel/cadastros" },
        { icon: Newspaper, label: "Notícias", path: "/painel/noticias" },
      ];

  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-col bg-primary text-primary-foreground lg:flex">
      <div className="border-b border-primary-foreground/10 p-6">
        <img src={logoLedurBranco} alt="Ledur Pré-Fabricados" className="h-10 w-auto" />
        <p className="text-xs text-primary-foreground/60">Command Center</p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.path === "/cliente" ? location.pathname === "/cliente" : location.pathname === item.path;
            return (
              <li key={item.path}>
                <button
                  onClick={() => navigate(item.path)}
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

export default Sidebar;
