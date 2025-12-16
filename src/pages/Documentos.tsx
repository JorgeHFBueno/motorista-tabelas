import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, Download, Eye, Filter, Search, FileCheck, FileWarning, Clock } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DocumentStatus = "aprovado" | "pendente" | "em-analise";

interface Document {
  id: string;
  name: string;
  category: string;
  date: string;
  status: DocumentStatus;
  size: string;
}

const documents: Document[] = [
  { id: "1", name: "Contrato de Prestação de Serviços", category: "Contratos", date: "15/03/2024", status: "aprovado", size: "2.4 MB" },
  { id: "2", name: "Projeto Estrutural - Rev.03", category: "Projetos", date: "20/04/2024", status: "aprovado", size: "15.8 MB" },
  { id: "3", name: "ART Responsabilidade Técnica", category: "ART / RRT", date: "10/03/2024", status: "aprovado", size: "450 KB" },
  { id: "4", name: "Alvará de Construção", category: "Licenças", date: "05/02/2024", status: "aprovado", size: "1.2 MB" },
  { id: "5", name: "NF Serviços - Fundação", category: "Notas Fiscais", date: "12/06/2024", status: "aprovado", size: "320 KB" },
  { id: "6", name: "Relatório Técnico - Etapa 3", category: "Relatórios", date: "28/09/2024", status: "em-analise", size: "3.1 MB" },
  { id: "7", name: "Aditivo Contratual #01", category: "Aditivos", date: "15/07/2024", status: "pendente", size: "890 KB" },
  { id: "8", name: "Memorial Descritivo", category: "Projetos", date: "18/03/2024", status: "aprovado", size: "5.6 MB" },
];

const categories = ["Todos", "Contratos", "Projetos", "ART / RRT", "Licenças", "Notas Fiscais", "Relatórios", "Aditivos"];

const statusConfig: Record<DocumentStatus, { label: string; variant: "default" | "secondary" | "outline"; icon: typeof FileCheck }> = {
  "aprovado": { label: "Aprovado", variant: "default", icon: FileCheck },
  "pendente": { label: "Pendente", variant: "outline", icon: Clock },
  "em-analise": { label: "Em Análise", variant: "secondary", icon: FileWarning },
};

const Documentos = () => {
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDocuments = documents.filter((doc) => {
    const matchesCategory = selectedCategory === "Todos" || doc.category === selectedCategory;
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleDocumentView = (docId: string) => {
    // Event: document_open
    console.log("Event: document_open", { document_id: docId });
  };

  const handleDocumentDownload = (docId: string) => {
    // Event: document_download
    console.log("Event: document_download", { document_id: docId });
  };

  return (
    <MobileLayout>
      <div className="bg-primary px-4 pt-12 pb-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="bg-white/10 p-2.5 rounded-lg">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Documentos</h1>
            <p className="text-white/70 text-sm">Arquivo institucional da obra</p>
          </div>
        </motion.div>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-24">
        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar documento..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white border-border/50"
          />
        </motion.div>

        {/* Categories Filter */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
        >
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => {
                setSelectedCategory(category);
                // Event: document_category_interest
                console.log("Event: document_category_interest", { category });
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === category
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {category}
            </button>
          ))}
        </motion.div>

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-3"
        >
          <div className="card-institutional p-3 text-center">
            <p className="text-2xl font-bold text-primary">{documents.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="card-institutional p-3 text-center">
            <p className="text-2xl font-bold text-secondary">{documents.filter(d => d.status === "aprovado").length}</p>
            <p className="text-xs text-muted-foreground">Aprovados</p>
          </div>
          <div className="card-institutional p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{documents.filter(d => d.status !== "aprovado").length}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </div>
        </motion.div>

        {/* Documents List */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">
              {filteredDocuments.length} documento{filteredDocuments.length !== 1 ? "s" : ""}
            </h2>
            <Filter className="w-4 h-4 text-muted-foreground" />
          </div>

          {filteredDocuments.map((doc, index) => {
            const status = statusConfig[doc.status];
            const StatusIcon = status.icon;
            
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className="card-institutional p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground text-sm truncate">{doc.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{doc.category}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{doc.date}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant={status.variant} className="text-xs gap-1">
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{doc.size}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => handleDocumentView(doc.id)}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    Visualizar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => handleDocumentDownload(doc.id)}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Baixar
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </MobileLayout>
  );
};

export default Documentos;
