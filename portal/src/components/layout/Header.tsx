import { Bell, User, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";

interface HeaderProps {
  projectName?: string;
}

const Header = ({ projectName = "Residência Silva" }: HeaderProps) => {
  return (
    <header className="bg-primary text-primary-foreground px-4 pt-12 pb-5">
      <div className="flex items-center justify-between">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 bg-primary-foreground/10 hover:bg-primary-foreground/15 px-3 py-2 rounded-lg transition-colors"
        >
          <div className="w-7 h-7 bg-secondary rounded flex items-center justify-center">
            <span className="text-secondary-foreground text-xs font-bold">L</span>
          </div>
          <span className="font-medium text-sm max-w-[140px] truncate">{projectName}</span>
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
    </header>
  );
};

export default Header;
