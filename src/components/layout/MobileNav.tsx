import { Building2, Camera, FileText, FolderCog, Upload, Wallet, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface MobileNavProps {
  onClose: () => void;
}

const MobileNav = ({ onClose }: MobileNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userDoc } = useAuth();

  const navItems = userDoc?.role === "cliente"
    ? [
      { icon: Building2, label: "Obra", path: "/cliente/obra" },
      { icon: Wallet, label: "Finanças", path: "/cliente/financas" },
      { icon: FileText, label: "Documentos", path: "/cliente/documentos" },
      { icon: Camera, label: "Fotos", path: "/cliente/fotos" },
    ]
    : [
      { icon: Building2, label: "Obras", path: "/painel/obras" },
      { icon: Upload, label: "Upload", path: "/painel/upload" },
      { icon: FolderCog, label: "Cadastros", path: "/painel/cadastros" },
    ];

  return (
    <div className="flex h-full flex-col bg-primary text-primary-foreground">
      <div className="flex items-center justify-between p-6 border-b border-primary-foreground/10">
        <h1 className="font-semibold text-lg">Menu</h1>
        <button onClick={onClose}><X className="w-5 h-5" /></button>
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
    </div>
  );
};

export default MobileNav;
