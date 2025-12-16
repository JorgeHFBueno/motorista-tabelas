import { motion } from "framer-motion";
import { FileText, CreditCard, Headphones, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";

const actions = [
  { 
    icon: FileText, 
    label: "Documentos", 
    path: "/documentos",
    event: "documents_entry_click"
  },
  { 
    icon: Camera, 
    label: "Fotos", 
    path: "/fotos",
    event: "photos_entry_click"
  },
  { 
    icon: CreditCard, 
    label: "Pagar", 
    path: "/financas",
    event: "payment_entry_click"
  },
  { 
    icon: Headphones, 
    label: "Suporte", 
    path: "/atendimento",
    event: "support_entry_click"
  },
];

const QuickActions = () => {
  const navigate = useNavigate();

  const handleClick = (action: typeof actions[0]) => {
    // Track entry click event for Big Data
    console.log(`Event: ${action.event}`);
    navigate(action.path);
  };

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
          onClick={() => handleClick(action)}
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
