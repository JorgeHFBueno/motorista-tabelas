import { Building2, Camera, FileText, FolderCog, House, Newspaper, Wallet } from "lucide-react";
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
      ]
    : [
        { icon: Building2, label: "Obras", path: "/painel/obras" },
        { icon: FolderCog, label: "Cadastros", path: "/painel/cadastros" },
        { icon: Newspaper, label: "Notícias", path: "/painel/noticias" },
      ];

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-primary text-primary-foreground h-screen sticky top-0">
      <div className="p-6 border-b border-primary-foreground/10">
        <img src={logoLedurBranco} alt="Ledur Pré-Fabricados" className="h-10 w-auto" />
        <p className="text-xs text-primary-foreground/60">Command Center</p>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.path === "/cliente"
              ? location.pathname === "/cliente"
              : location.pathname === item.path;
            return (
              <li key={item.path}>
                <button
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-left",
                    isActive
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground",
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
    </aside>
  );
};

export default Sidebar;
