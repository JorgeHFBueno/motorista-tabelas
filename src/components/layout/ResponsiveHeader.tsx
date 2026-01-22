import { Bell, User, ChevronDown, Menu } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import MobileNav from "./MobileNav";
import { useObra } from "@/contexts/ObraContext";

interface ResponsiveHeaderProps {
  pageTitle?: string;
  pageSubtitle?: string;
}

const ResponsiveHeader = ({ 
  pageTitle,
  pageSubtitle
}: ResponsiveHeaderProps) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { obraAtiva } = useObra();

  return (
    <header className="bg-primary text-primary-foreground">
      {/* Mobile Header */}
      <div className="lg:hidden px-4 pt-12 pb-5">
        <div className="flex items-center justify-between">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 px-3 py-2 rounded-lg transition-colors"
          >
            <div className="w-7 h-7 bg-secondary rounded flex items-center justify-center">
              <span className="text-secondary-foreground text-xs font-bold">L</span>
            </div>
            <span className="font-medium text-sm max-w-[140px] truncate">{obraAtiva.nome}</span>
            <ChevronDown className="w-4 h-4 opacity-60" />
          </motion.button>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1.5"
          >
            <button className="relative p-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-secondary rounded-full" />
            </button>
            <button className="p-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
              <User className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </div>

      {/* Tablet Header (md to lg) */}
      <div className="hidden md:flex lg:hidden px-6 py-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <button className="p-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-primary p-0 border-0">
              <MobileNav onClose={() => setIsMobileMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
              <span className="text-secondary-foreground text-lg font-bold">L</span>
            </div>
            <div>
              <h1 className="font-semibold">Ledur Pré-Fabricados</h1>
              <p className="text-xs text-primary-foreground/60">{obraAtiva.nome}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="relative p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full" />
          </button>
          <button className="p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
            <User className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex px-8 py-4 items-center justify-between border-b border-primary-foreground/10">
        <div>
          {pageTitle ? (
            <div>
              <h1 className="text-xl font-semibold">{pageTitle}</h1>
              {pageSubtitle && (
                <p className="text-sm text-primary-foreground/70">{pageSubtitle}</p>
              )}
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-semibold">Dashboard</h1>
              <p className="text-sm text-primary-foreground/70">Visão geral da sua obra</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button className="relative p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full" />
          </button>
          <button className="flex items-center gap-3 p-2 px-3 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors">
            <User className="w-5 h-5" />
            <span className="text-sm font-medium">João Silva</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default ResponsiveHeader;
