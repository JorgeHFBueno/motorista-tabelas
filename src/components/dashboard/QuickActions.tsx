import { motion } from "framer-motion";
import { FileText, CreditCard, Headphones, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";

const actions = [
  { icon: FileText, label: "Documentos", path: "/documentos", color: "bg-primary" },
  { icon: CreditCard, label: "Pagar", path: "/financas", color: "bg-success" },
  { icon: Headphones, label: "Suporte", path: "/atendimento", color: "bg-accent" },
  { icon: Camera, label: "Fotos", path: "/fotos", color: "bg-primary" },
];

const QuickActions = () => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="grid grid-cols-4 gap-3"
    >
      {actions.map((action, index) => (
        <motion.button
          key={action.label}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 + index * 0.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(action.path)}
          className="flex flex-col items-center gap-2 p-3 bg-card rounded-xl shadow-card hover:shadow-card-hover transition-shadow"
        >
          <div className={`${action.color} p-2.5 rounded-xl`}>
            <action.icon className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-medium text-foreground">{action.label}</span>
        </motion.button>
      ))}
    </motion.div>
  );
};

export default QuickActions;
