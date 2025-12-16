import { motion } from "framer-motion";
import { FileText, CreditCard, Headphones, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";

const actions = [
  { icon: FileText, label: "Documentos", path: "/documentos" },
  { icon: CreditCard, label: "Pagar", path: "/financas" },
  { icon: Headphones, label: "Suporte", path: "/atendimento" },
  { icon: Camera, label: "Fotos", path: "/fotos" },
];

const QuickActions = () => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="grid grid-cols-4 gap-2"
    >
      {actions.map((action, index) => (
        <motion.button
          key={action.label}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 + index * 0.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(action.path)}
          className="flex flex-col items-center gap-1.5 p-3 card-institutional hover:shadow-card transition-shadow"
        >
          <div className="bg-primary p-2 rounded-lg">
            <action.icon className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-xs font-medium text-primary">{action.label}</span>
        </motion.button>
      ))}
    </motion.div>
  );
};

export default QuickActions;
