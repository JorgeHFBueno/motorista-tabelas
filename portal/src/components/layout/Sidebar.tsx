import { Building2, Camera, FileText, House, LifeBuoy, Newspaper, Wallet } from "lucide-react";
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

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-col bg-primary text-primary-foreground lg:flex">
      <div className="border-b border-primary-foreground/10 p-6">
        <img src={logoLedurBranco} alt="Ledur Pré-Fabricados" className="h-10 w-auto" />
        <p className="text-xs text-primary-foreground/60">Command Center</p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
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
