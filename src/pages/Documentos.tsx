import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileText, Download, Eye, Filter, Search, FileCheck, Clock, 
  PenTool, Send, Shield, History, X, CheckCircle2, AlertCircle,
  FileSignature, Fingerprint, Globe, Calendar, User
} from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useDocumentos } from "@/hooks/useAppQueries";
import { useActiveObraId } from "@/hooks/useActiveObraId";

type SignatureStatus = "rascunho" | "enviado" | "assinado" | "finalizado";
type DocumentCategory = "Contratos" | "Projetos" | "ART / RRT" | "Licenças" | "Notas Fiscais" | "Relatórios" | "Aditivos";

interface SignatureRecord {
  signer: string;
  role: string;
  signedAt: string;
  ip: string;
  method: string;
}

interface DocumentVersion {
  version: string;
  date: string;
  author: string;
  changes: string;
}

interface AuditEvent {
  action: string;
  date: string;
  user: string;
  ip: string;
}

interface Document {
  id: string;
  name: string;
  category: DocumentCategory;
  date: string;
  signatureStatus: SignatureStatus;
  size: string;
  requiresSignature: boolean;
  signers?: SignatureRecord[];
  versions?: DocumentVersion[];
  auditTrail?: AuditEvent[];
  certificateId?: string;
}

const documents: Document[] = [
  { 
    id: "1", 
    name: "Contrato de Prestação de Serviços", 
    category: "Contratos", 
    date: "15/03/2024", 
    signatureStatus: "finalizado", 
    size: "2.4 MB",
    requiresSignature: true,
    certificateId: "CERT-2024-001-LDR",
    signers: [
      { signer: "João Silva", role: "Contratante", signedAt: "15/03/2024 14:32", ip: "189.45.123.45", method: "Assinatura Eletrônica" },
      { signer: "Ledur Pré-Fabricados", role: "Contratada", signedAt: "15/03/2024 16:45", ip: "201.33.87.12", method: "Certificado Digital ICP-Brasil" }
    ],
    versions: [
      { version: "1.0", date: "10/03/2024", author: "Dep. Jurídico", changes: "Versão inicial do contrato" },
      { version: "1.1", date: "12/03/2024", author: "Dep. Jurídico", changes: "Ajuste de cláusulas 4.2 e 5.1" },
      { version: "1.2", date: "15/03/2024", author: "Dep. Jurídico", changes: "Versão final aprovada" }
    ],
    auditTrail: [
      { action: "Documento criado", date: "10/03/2024 09:15", user: "Sistema", ip: "interno" },
      { action: "Enviado para assinatura", date: "14/03/2024 11:30", user: "Maria Santos", ip: "201.33.87.12" },
      { action: "Assinado pelo contratante", date: "15/03/2024 14:32", user: "João Silva", ip: "189.45.123.45" },
      { action: "Assinado pela contratada", date: "15/03/2024 16:45", user: "Ledur Pré-Fabricados", ip: "201.33.87.12" },
      { action: "Documento finalizado", date: "15/03/2024 16:45", user: "Sistema", ip: "interno" }
    ]
  },
  { 
    id: "2", 
    name: "Aditivo Contratual #01 - Ampliação", 
    category: "Aditivos", 
    date: "15/07/2024", 
    signatureStatus: "enviado", 
    size: "890 KB",
    requiresSignature: true,
    signers: [
      { signer: "João Silva", role: "Contratante", signedAt: "-", ip: "-", method: "Pendente" }
    ],
    versions: [
      { version: "1.0", date: "10/07/2024", author: "Dep. Jurídico", changes: "Versão inicial do aditivo" }
    ],
    auditTrail: [
      { action: "Documento criado", date: "10/07/2024 10:00", user: "Sistema", ip: "interno" },
      { action: "Enviado para assinatura", date: "15/07/2024 09:00", user: "Maria Santos", ip: "201.33.87.12" }
    ]
  },
  { 
    id: "3", 
    name: "Termo de Aceite - Etapa Fundação", 
    category: "Contratos", 
    date: "20/06/2024", 
    signatureStatus: "assinado", 
    size: "320 KB",
    requiresSignature: true,
    certificateId: "CERT-2024-015-LDR",
    signers: [
      { signer: "João Silva", role: "Contratante", signedAt: "20/06/2024 10:15", ip: "189.45.123.45", method: "Assinatura Eletrônica" }
    ],
    versions: [
      { version: "1.0", date: "18/06/2024", author: "Eng. Responsável", changes: "Documento gerado automaticamente" }
    ],
    auditTrail: [
      { action: "Documento criado", date: "18/06/2024 14:00", user: "Sistema", ip: "interno" },
      { action: "Enviado para assinatura", date: "19/06/2024 08:30", user: "Carlos Eng.", ip: "201.33.87.12" },
      { action: "Assinado pelo contratante", date: "20/06/2024 10:15", user: "João Silva", ip: "189.45.123.45" }
    ]
  },
  { 
    id: "4", 
    name: "Minuta - Aditivo de Prazo", 
    category: "Aditivos", 
    date: "01/10/2024", 
    signatureStatus: "rascunho", 
    size: "450 KB",
    requiresSignature: true,
    versions: [
      { version: "0.1", date: "01/10/2024", author: "Dep. Jurídico", changes: "Rascunho inicial" }
    ],
    auditTrail: [
      { action: "Documento criado", date: "01/10/2024 11:00", user: "Sistema", ip: "interno" }
    ]
  },
  { 
    id: "5", 
    name: "Projeto Estrutural - Rev.03", 
    category: "Projetos", 
    date: "20/04/2024", 
    signatureStatus: "finalizado", 
    size: "15.8 MB",
    requiresSignature: false
  },
  { 
    id: "6", 
    name: "ART Responsabilidade Técnica", 
    category: "ART / RRT", 
    date: "10/03/2024", 
    signatureStatus: "finalizado", 
    size: "450 KB",
    requiresSignature: false
  },
  { 
    id: "7", 
    name: "Alvará de Construção", 
    category: "Licenças", 
    date: "05/02/2024", 
    signatureStatus: "finalizado", 
    size: "1.2 MB",
    requiresSignature: false
  },
  { 
    id: "8", 
    name: "NF Serviços - Fundação", 
    category: "Notas Fiscais", 
    date: "12/06/2024", 
    signatureStatus: "finalizado", 
    size: "320 KB",
    requiresSignature: false
  },
];

const categories = ["Todos", "Contratos", "Aditivos", "Projetos", "ART / RRT", "Licenças", "Notas Fiscais", "Relatórios"];

const signatureStatusConfig: Record<SignatureStatus, { 
  label: string; 
  color: string;
  bgColor: string;
  icon: typeof FileCheck;
  description: string;
}> = {
  "rascunho": { 
    label: "Rascunho", 
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    icon: FileText,
    description: "Documento em elaboração"
  },
  "enviado": { 
    label: "Aguardando Assinatura", 
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    icon: Send,
    description: "Enviado para assinatura"
  },
  "assinado": { 
    label: "Assinado", 
    color: "text-secondary",
    bgColor: "bg-secondary/10",
    icon: PenTool,
    description: "Assinatura coletada"
  },
  "finalizado": { 
    label: "Finalizado", 
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    icon: CheckCircle2,
    description: "Documento com validade jurídica"
  },
};

const Documentos = () => {
  const { activeObraId, hasClientObra } = useActiveObraId();
  const { data: documentosData = [], isLoading } = useDocumentos(activeObraId ?? undefined);
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const filteredDocuments = documents.filter((doc) => {
    const matchesCategory = selectedCategory === "Todos" || doc.category === selectedCategory;
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleDocumentView = (doc: Document) => {
    setSelectedDocument(doc);
    setIsDetailOpen(true);
    console.log("Event: document_open", { document_id: doc.id });
  };

  const handleDocumentDownload = (docId: string) => {
    console.log("Event: document_download", { document_id: docId });
  };

  const handleSignDocument = (docId: string) => {
    console.log("Event: document_sign_initiated", { document_id: docId });
  };

  const signableCount = documents.filter(d => d.requiresSignature).length;
  const pendingSignature = documents.filter(d => d.signatureStatus === "enviado").length;
  const signedCount = documents.filter(d => d.signatureStatus === "assinado" || d.signatureStatus === "finalizado").length;

  return (
    <ResponsiveLayout headerTitle="Documentos" headerSubtitle="Arquivo institucional e contratos">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        {!hasClientObra ? "Sem obra vinculada." : isLoading ? "Carregando documentos da obra..." : `Documentos carregados: ${documentosData.length}`}
      </div>
      
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

        {/* Signature Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-institutional p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-primary">Status de Assinaturas</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <p className="text-xl font-bold text-foreground">{signableCount}</p>
              <p className="text-[10px] text-muted-foreground">Requerem assinatura</p>
            </div>
            <div className="text-center p-2 bg-amber-50 rounded-lg">
              <p className="text-xl font-bold text-amber-600">{pendingSignature}</p>
              <p className="text-[10px] text-muted-foreground">Aguardando</p>
            </div>
            <div className="text-center p-2 bg-emerald-50 rounded-lg">
              <p className="text-xl font-bold text-emerald-600">{signedCount}</p>
              <p className="text-[10px] text-muted-foreground">Assinados</p>
            </div>
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
            const status = signatureStatusConfig[doc.signatureStatus];
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
                  <div className={`p-2 rounded-lg shrink-0 ${status.bgColor}`}>
                    <StatusIcon className={`w-5 h-5 ${status.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground text-sm truncate">{doc.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{doc.category}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{doc.date}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        {doc.requiresSignature && doc.signatureStatus === "finalizado" && (
                          <Shield className="w-3 h-3 text-emerald-600" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{doc.size}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => handleDocumentView(doc)}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    Detalhes
                  </Button>
                  {doc.requiresSignature && doc.signatureStatus === "enviado" ? (
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleSignDocument(doc.id)}
                    >
                      <PenTool className="w-3.5 h-3.5 mr-1.5" />
                      Assinar
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleDocumentDownload(doc.id)}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Baixar
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Document Detail Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl p-0">
          {selectedDocument && (
            <div className="flex flex-col h-full">
              <SheetHeader className="p-4 border-b border-border bg-primary text-white rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-white text-lg">{selectedDocument.name}</SheetTitle>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${signatureStatusConfig[selectedDocument.signatureStatus].bgColor} ${signatureStatusConfig[selectedDocument.signatureStatus].color}`}>
                    {signatureStatusConfig[selectedDocument.signatureStatus].label}
                  </span>
                  {selectedDocument.certificateId && (
                    <span className="text-xs text-white/70">
                      {selectedDocument.certificateId}
                    </span>
                  )}
                </div>
              </SheetHeader>

              <Tabs defaultValue="info" className="flex-1 overflow-hidden">
                <TabsList className="w-full justify-start px-4 pt-2 bg-transparent border-b rounded-none">
                  <TabsTrigger value="info" className="text-xs">Informações</TabsTrigger>
                  <TabsTrigger value="signatures" className="text-xs">Assinaturas</TabsTrigger>
                  <TabsTrigger value="audit" className="text-xs">Auditoria</TabsTrigger>
                  <TabsTrigger value="versions" className="text-xs">Versões</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto p-4">
                  <TabsContent value="info" className="mt-0 space-y-4">
                    <div className="card-institutional p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">Detalhes do Documento</span>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Categoria</p>
                          <p className="font-medium">{selectedDocument.category}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Tamanho</p>
                          <p className="font-medium">{selectedDocument.size}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Data</p>
                          <p className="font-medium">{selectedDocument.date}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Requer Assinatura</p>
                          <p className="font-medium">{selectedDocument.requiresSignature ? "Sim" : "Não"}</p>
                        </div>
                      </div>
                    </div>

                    {selectedDocument.signatureStatus === "finalizado" && selectedDocument.certificateId && (
                      <div className="card-institutional p-4 bg-emerald-50 border-emerald-200">
                        <div className="flex items-center gap-2 mb-3">
                          <Shield className="w-5 h-5 text-emerald-600" />
                          <span className="text-sm font-semibold text-emerald-700">Certificado de Assinatura</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-emerald-600">ID do Certificado</span>
                            <span className="font-mono font-medium text-emerald-800">{selectedDocument.certificateId}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-emerald-600">Validade Jurídica</span>
                            <span className="font-medium text-emerald-800">Conforme MP 2.200-2</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-emerald-600">Hash do Documento</span>
                            <span className="font-mono text-xs text-emerald-800">SHA-256</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedDocument.signatureStatus === "enviado" && (
                      <Button className="w-full" onClick={() => handleSignDocument(selectedDocument.id)}>
                        <PenTool className="w-4 h-4 mr-2" />
                        Assinar Documento
                      </Button>
                    )}
                  </TabsContent>

                  <TabsContent value="signatures" className="mt-0 space-y-3">
                    {selectedDocument.signers && selectedDocument.signers.length > 0 ? (
                      selectedDocument.signers.map((signer, idx) => (
                        <div key={idx} className="card-institutional p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`p-2 rounded-full ${signer.signedAt !== "-" ? "bg-emerald-100" : "bg-amber-100"}`}>
                              {signer.signedAt !== "-" ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Clock className="w-4 h-4 text-amber-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{signer.signer}</p>
                              <p className="text-xs text-muted-foreground">{signer.role}</p>
                            </div>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Assinado em:</span>
                              <span className="font-medium">{signer.signedAt}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">IP:</span>
                              <span className="font-mono">{signer.ip}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Fingerprint className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Método:</span>
                              <span className="font-medium">{signer.method}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileSignature className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Este documento não requer assinaturas</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="audit" className="mt-0">
                    {selectedDocument.auditTrail && selectedDocument.auditTrail.length > 0 ? (
                      <div className="relative">
                        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                        <div className="space-y-4">
                          {selectedDocument.auditTrail.map((event, idx) => (
                            <div key={idx} className="relative pl-10">
                              <div className="absolute left-2 w-4 h-4 rounded-full bg-primary border-2 border-white" />
                              <div className="card-institutional p-3">
                                <p className="font-medium text-sm">{event.action}</p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  <span>{event.date}</span>
                                  <span>•</span>
                                  <span>{event.user}</span>
                                  {event.ip !== "interno" && (
                                    <>
                                      <span>•</span>
                                      <span className="font-mono">{event.ip}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Sem eventos de auditoria</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="versions" className="mt-0 space-y-3">
                    {selectedDocument.versions && selectedDocument.versions.length > 0 ? (
                      selectedDocument.versions.map((version, idx) => (
                        <div key={idx} className="card-institutional p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-sm">Versão {version.version}</span>
                            <span className="text-xs text-muted-foreground">{version.date}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{version.changes}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            <User className="w-3 h-3 inline mr-1" />
                            {version.author}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Sem histórico de versões</p>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              <div className="p-4 border-t border-border bg-white">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => handleDocumentDownload(selectedDocument.id)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Documento
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ResponsiveLayout>
  );
};

export default Documentos;
