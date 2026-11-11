import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { TELAS_PORTAL, useTelasComNovidade } from "./navegacao";

// Computer: the portal screens as tabs under the header. On phone and tablet the same list is the bottom bar.
const AbasNavegacao = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const comNovidade = useTelasComNovidade();

  return (
    <nav aria-label="Telas do portal" className="hidden lg:block">
      <div className="flex gap-1 px-8">
        {TELAS_PORTAL.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 border-b-[3px] px-3.5 pb-3 pt-2.5 text-[15px] transition-colors",
                isActive
                  ? "border-orange-500 font-semibold text-primary-foreground"
                  : "border-transparent font-medium text-primary-foreground/65 hover:text-primary-foreground",
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
              {comNovidade.has(item.path) ? <span className="h-2 w-2 rounded-full bg-orange-500" aria-label="Novidade" /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default AbasNavegacao;
