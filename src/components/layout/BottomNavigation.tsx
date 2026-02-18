import { Building2, Camera, FileText, FolderCog, Upload, Wallet } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

import { useAuth } from "@/contexts/AuthContext";

const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userDoc } = useAuth();

  const navItems = userDoc?.role === "cliente"
    ? [
        { icon: Building2, label: "Obra", path: "/cliente/obra" },
        { icon: Wallet, label: "Finanças", path: "/cliente/financas" },
        { icon: FileText, label: "Docs", path: "/cliente/documentos" },
        { icon: Camera, label: "Fotos", path: "/cliente/fotos" },
      ]
    : [
        { icon: Building2, label: "Obras", path: "/painel/obras" },
        { icon: Upload, label: "Upload", path: "/painel/upload" },
        { icon: FolderCog, label: "Cadastro", path: "/painel/cadastros" },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto lg:hidden">
      <div className="bg-primary mx-4 mb-4 rounded-xl shadow-lg overflow-hidden border border-primary/20">
        <div className="flex items-center justify-around py-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "relative flex flex-col items-center justify-center py-2 px-2 rounded-lg transition-all duration-200",
                  isActive ? "text-primary-foreground" : "text-primary-foreground/50 hover:text-primary-foreground/70",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-secondary/30 rounded-lg"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
                <item.icon className={cn("w-5 h-5 mb-0.5 transition-transform duration-200 relative z-10", isActive && "scale-105")} />
                <span className="text-[10px] font-medium relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNavigation;
