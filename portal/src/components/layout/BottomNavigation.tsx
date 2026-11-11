import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TELAS_PORTAL, useTelasComNovidade } from "./navegacao";

// Phone and tablet: the portal screens in a bar at the bottom. On the computer the same list is the header tabs.
const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const comNovidade = useTelasComNovidade();

  return (
    <nav aria-label="Telas do portal" className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md lg:hidden">
      <div className="mx-4 mb-4 overflow-hidden rounded-xl border border-primary/20 bg-primary shadow-lg">
        <div className="flex items-center justify-around py-1.5">
          {TELAS_PORTAL.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-lg px-2 py-2 transition-all duration-200",
                  isActive ? "text-primary-foreground" : "text-primary-foreground/50 hover:text-primary-foreground/70",
                )}
              >
                {isActive ? (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-lg bg-secondary/30"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                ) : null}
                <item.icon className={cn("relative z-10 mb-0.5 h-5 w-5 transition-transform duration-200", isActive && "scale-105")} />
                <span className="relative z-10 text-[10px] font-medium">{item.curto}</span>
                {comNovidade.has(item.path) ? (
                  <span className="absolute right-1.5 top-1.5 z-10 h-2 w-2 rounded-full bg-orange-500" aria-label="Novidade" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNavigation;
