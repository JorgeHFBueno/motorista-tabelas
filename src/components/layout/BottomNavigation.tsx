import { Home, Building2, Wallet, MessageSquare } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Home, label: "Início", path: "/" },
  { icon: Building2, label: "Minha Obra", path: "/obra" },
  { icon: Wallet, label: "Finanças", path: "/financas" },
  { icon: MessageSquare, label: "Atendimento", path: "/atendimento" },
];

const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto">
      <div className="bg-primary mx-4 mb-4 rounded-2xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "relative flex flex-col items-center justify-center py-3 px-4 rounded-xl transition-all duration-300",
                  isActive 
                    ? "text-primary-foreground" 
                    : "text-primary-foreground/60 hover:text-primary-foreground/80"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-accent/20 rounded-xl"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <item.icon 
                  className={cn(
                    "w-6 h-6 mb-1 transition-transform duration-200",
                    isActive && "scale-110"
                  )} 
                />
                <span className="text-xs font-medium">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-accent"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNavigation;
