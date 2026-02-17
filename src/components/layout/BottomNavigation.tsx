import { Home, Building2, Wallet, FileText, Camera, Upload } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Home, label: "Início", path: "/" },
  { icon: Building2, label: "Obra", path: "/obra" },
  { icon: Wallet, label: "Finanças", path: "/financas" },
  { icon: FileText, label: "Docs", path: "/documentos" },
  { icon: Camera, label: "Fotos", path: "/fotos" },
  { icon: Upload, label: "Upload", path: "/upload" },
];

const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

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
                  isActive 
                    ? "text-primary-foreground" 
                    : "text-primary-foreground/50 hover:text-primary-foreground/70"
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
                <item.icon 
                  className={cn(
                    "w-5 h-5 mb-0.5 transition-transform duration-200 relative z-10",
                    isActive && "scale-105"
                  )} 
                />
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
