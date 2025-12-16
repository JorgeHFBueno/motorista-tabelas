import { useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Phone, Mail, Clock, Send, Plus, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Ticket {
  id: string;
  title: string;
  category: "financial" | "technical" | "administrative";
  status: "open" | "in-progress" | "resolved";
  date: string;
  lastMessage: string;
}

const tickets: Ticket[] = [
  {
    id: "1",
    title: "Dúvida sobre prazo de entrega",
    category: "technical",
    status: "resolved",
    date: "10/12/2024",
    lastMessage: "Prezado cliente, o prazo está mantido para dezembro de 2025.",
  },
  {
    id: "2",
    title: "Solicitação de boleto",
    category: "financial",
    status: "in-progress",
    date: "15/12/2024",
    lastMessage: "Estamos gerando o boleto, em breve será enviado por email.",
  },
];

const categoryConfig = {
  financial: { label: "Financeiro", color: "bg-accent/10 text-accent" },
  technical: { label: "Técnico", color: "bg-progress-fill/10 text-progress-fill" },
  administrative: { label: "Administrativo", color: "bg-primary/10 text-primary" },
};

const statusConfig = {
  open: { label: "Aberto", icon: AlertCircle, color: "text-accent" },
  "in-progress": { label: "Em andamento", icon: Clock, color: "text-progress-fill" },
  resolved: { label: "Resolvido", icon: CheckCircle2, color: "text-success" },
};

const Atendimento = () => {
  const [activeTab, setActiveTab] = useState<"tickets" | "contact">("tickets");

  return (
    <MobileLayout>
      <Header projectName="Residência Silva" />
      
      <div className="px-4 -mt-4 space-y-4">
        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl p-1.5 shadow-card flex"
        >
          <button
            onClick={() => setActiveTab("tickets")}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all",
              activeTab === "tickets"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Meus Tickets
          </button>
          <button
            onClick={() => setActiveTab("contact")}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all",
              activeTab === "contact"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Contato
          </button>
        </motion.div>

        {activeTab === "tickets" ? (
          <>
            {/* New Ticket Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Button variant="accent" className="w-full" size="lg">
                <Plus className="w-5 h-5" />
                Abrir Novo Ticket
              </Button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="grid grid-cols-3 gap-2"
            >
              <div className="bg-card rounded-xl p-3 shadow-card text-center">
                <p className="text-2xl font-bold text-foreground">2</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="bg-card rounded-xl p-3 shadow-card text-center">
                <p className="text-2xl font-bold text-progress-fill">1</p>
                <p className="text-xs text-muted-foreground">Andamento</p>
              </div>
              <div className="bg-card rounded-xl p-3 shadow-card text-center">
                <p className="text-2xl font-bold text-success">1</p>
                <p className="text-xs text-muted-foreground">Resolvidos</p>
              </div>
            </motion.div>

            {/* Tickets List */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-3"
            >
              {tickets.map((ticket, index) => {
                const StatusIcon = statusConfig[ticket.status].icon;
                return (
                  <motion.button
                    key={ticket.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + index * 0.1 }}
                    className="w-full bg-card rounded-2xl p-4 shadow-card text-left hover:shadow-card-hover transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={cn("w-4 h-4", statusConfig[ticket.status].color)} />
                        <span className={cn("text-xs font-medium", statusConfig[ticket.status].color)}>
                          {statusConfig[ticket.status].label}
                        </span>
                      </div>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        categoryConfig[ticket.category].color
                      )}>
                        {categoryConfig[ticket.category].label}
                      </span>
                    </div>
                    
                    <h3 className="font-semibold text-foreground mb-1">{ticket.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {ticket.lastMessage}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{ticket.date}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </>
        ) : (
          <>
            {/* Contact Options */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-3"
            >
              <button className="w-full bg-card rounded-2xl p-4 shadow-card flex items-center gap-4 hover:shadow-card-hover transition-shadow">
                <div className="p-3 bg-success/10 rounded-xl">
                  <Phone className="w-6 h-6 text-success" />
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-semibold text-foreground">Telefone</h3>
                  <p className="text-sm text-muted-foreground">(51) 3XXX-XXXX</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>

              <button className="w-full bg-card rounded-2xl p-4 shadow-card flex items-center gap-4 hover:shadow-card-hover transition-shadow">
                <div className="p-3 bg-success/10 rounded-xl">
                  <MessageSquare className="w-6 h-6 text-success" />
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-semibold text-foreground">WhatsApp</h3>
                  <p className="text-sm text-muted-foreground">(51) 9XXXX-XXXX</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>

              <button className="w-full bg-card rounded-2xl p-4 shadow-card flex items-center gap-4 hover:shadow-card-hover transition-shadow">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-semibold text-foreground">E-mail</h3>
                  <p className="text-sm text-muted-foreground">contato@ledur.com.br</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </motion.div>

            {/* Business Hours */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-2xl p-4 shadow-card"
            >
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Horário de Atendimento</h3>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Segunda a Sexta</span>
                  <span className="text-foreground font-medium">8h às 18h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sábado</span>
                  <span className="text-foreground font-medium">8h às 12h</span>
                </div>
              </div>
            </motion.div>

            {/* Quick Message */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card rounded-2xl p-4 shadow-card"
            >
              <h3 className="font-semibold text-foreground mb-3">Mensagem Rápida</h3>
              <textarea
                placeholder="Digite sua mensagem..."
                className="w-full bg-muted rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button variant="default" className="w-full mt-3">
                <Send className="w-4 h-4" />
                Enviar Mensagem
              </Button>
            </motion.div>
          </>
        )}
      </div>
    </MobileLayout>
  );
};

export default Atendimento;
