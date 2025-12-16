import { Bell, User, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";

interface HeaderProps {
  projectName?: string;
}

const Header = ({ projectName = "Residência Silva" }: HeaderProps) => {
  return (
    <header className="bg-primary text-primary-foreground px-4 pt-12 pb-6 rounded-b-3xl">
      <div className="flex items-center justify-between">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 bg-primary-foreground/10 hover:bg-primary-foreground/20 px-4 py-2.5 rounded-full transition-colors"
        >
          <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center">
            <span className="text-accent-foreground text-xs font-bold">L</span>
          </div>
          <span className="font-medium text-sm max-w-[140px] truncate">{projectName}</span>
          <ChevronDown className="w-4 h-4 opacity-70" />
        </motion.button>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2"
        >
          <button className="relative p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded-full transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full" />
          </button>
          <button className="p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded-full transition-colors">
            <User className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    </header>
  );
};

export default Header;
