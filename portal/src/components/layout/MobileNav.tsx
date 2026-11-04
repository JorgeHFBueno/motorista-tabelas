import { Building2, Camera, FileText, House, LifeBuoy, Wallet, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  onClose: () => void;
}

const navItems = [
  { icon: House, label: "Dashboard", path: "/" },
  { icon: Building2, label: "Obra", path: "/obra" },
  { icon: Wallet, label: "Finanças", path: "/financas" },
  { icon: FileText, label: "Documentos", path: "/documentos" },
  { icon: Camera, label: "Fotos", path: "/fotos" },
  { icon: LifeBuoy, label: "Atendimento", path: "/atendimento" },
];

const MobileNav = ({ onClose }: MobileNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col bg-primary text-primary-foreground">
      <div className="flex items-center justify-between border-b border-primary-foreground/10 p-6">
        <h1 className="text-lg font-semibold">Menu</h1>
        <button onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 p-4">
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
    </div>
  );
};

export default MobileNav;
