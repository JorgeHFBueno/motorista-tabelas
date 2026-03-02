import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Download,
  Eye,
  Filter,
  Search,
  FileCheck,
  Clock,
  PenTool,
  Send,
  Shield,
  History,
  X,
  CheckCircle2,
  AlertCircle,
  FileSignature,
  Fingerprint,
  Globe,
  Calendar,
  User,
  Upload,
} from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveObraId } from "@/hooks/useActiveObraId";
import { useToast } from "@/hooks/use-toast";
import {
  useAssinaturas,
  useAuditoria,
  useDocumento,
  useDocumentosList,
  useDownloadDocumento,
  useUploadDocumento,
  useVersoes,
} from "@/lib/documentos/documentos.queries";
import { DOCUMENT_CATEGORIES, type Documento, type DocumentoCategoria } from "@/lib/documentos/documentos.types";

type SignatureStatusView = "rascunho" | "enviado" | "assinado" | "finalizado";

const categories = ["Todos", ...DOCUMENT_CATEGORIES] as const;

const signatureStatusConfig: Record<
  SignatureStatusView,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: typeof FileCheck;
  }
> = {
  rascunho: { label: "Requer assinatura", color: "text-muted-foreground", bgColor: "bg-muted", icon: FileText },
  enviado: { label: "Aguardando Assinatura", color: "text-amber-600", bgColor: "bg-amber-50", icon: Send },
  assinado: { label: "Assinado", color: "text-secondary", bgColor: "bg-secondary/10", icon: PenTool },
  finalizado: { label: "Finalizado", color: "text-emerald-600", bgColor: "bg-emerald-50", icon: CheckCircle2 },
};

const toViewStatus = (doc: Documento): SignatureStatusView => {
  if (doc.assinaturaStatus === "AGUARDANDO") return "enviado";
  if (doc.assinaturaStatus === "ASSINADO" && doc.requerAssinatura) return "assinado";
  if (doc.status === "Requer assinatura") return "rascunho";
  if (doc.status === "Aguardando") return "enviado";
  return "finalizado";
};

const formatDate = (value?: { toDate?: () => Date }) => (value?.toDate ? value.toDate().toLocaleDateString("pt-BR") : "—");
const formatDateTime = (value?: { toDate?: () => Date }) =>
  value?.toDate ? value.toDate().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const getDefaultTitle = (fileName: string) => fileName.replace(/\.[^/.]+$/, "");

const Documentos = () => {
  const { activeObraId, hasClientObra } = useActiveObraId();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<DocumentoCategoria | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<DocumentoCategoria | "">("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [requiresSignature, setRequiresSignature] = useState(false);

  const { data: documentosData = [], isLoading } = useDocumentosList(
    activeObraId ?? undefined,
    selectedCategory,
    debouncedSearch,
  );
  const detailsEnabled = Boolean(selectedDocumentId) && isDetailOpen;
  const { data: selectedDocument, isLoading: loadingDetail } = useDocumento(selectedDocumentId ?? undefined, detailsEnabled);
  const { data: auditoriaData = [] } = useAuditoria(selectedDocumentId ?? undefined, detailsEnabled);
  const { data: assinaturasData = [] } = useAssinaturas(selectedDocumentId ?? undefined, detailsEnabled);
  const { data: versoesData = [] } = useVersoes(selectedDocumentId ?? undefined, detailsEnabled);
  const uploadMutation = useUploadDocumento();
  const downloadMutation = useDownloadDocumento();

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const signatureCounts = useMemo(
    () => ({
      requires: documentosData.filter((doc) => doc.assinaturaStatus === "REQUER_ASSINATURA").length,
      waiting: documentosData.filter((doc) => doc.assinaturaStatus === "AGUARDANDO").length,
      signed: documentosData.filter((doc) => doc.assinaturaStatus === "ASSINADO").length,
    }),
    [documentosData],
  );

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadCategory("");
    setUploadTitle("");
    setRequiresSignature(false);
  };

  const handleDocumentDownload = async (docItem: Documento) => {
    try {
      await downloadMutation.mutateAsync(docItem);
    } catch (error) {
      toast({
        title: "Falha no download",
        description: error instanceof Error ? error.message : "Não foi possível baixar o documento.",
        variant: "destructive",
      });
    }
  };

  const handleUploadSubmit = async () => {
    if (!uploadFile || !uploadCategory || !uploadTitle.trim()) {
      toast({ title: "Dados incompletos", description: "Selecione arquivo, categoria e título." });
      return;
    }

    try {
      await uploadMutation.mutateAsync({
        file: uploadFile,
        categoria: uploadCategory,
        titulo: uploadTitle.trim(),
        obraId: activeObraId ?? undefined,
        requerAssinatura: requiresSignature,
      });
      toast({ title: "Documento enviado", description: "Upload concluído com sucesso." });
      setIsUploadOpen(false);
      resetUploadForm();
    } catch (error) {
      toast({
        title: "Falha no upload",
        description: error instanceof Error ? error.message : "Não foi possível enviar o documento.",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (file?: File) => {
    if (!file) return;
    const isValid = ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type);

    if (!isValid) {
      toast({
        title: "Arquivo inválido",
        description: "Envie apenas PDF ou imagens PNG/JPG/JPEG/WEBP.",
        variant: "destructive",
      });
      return;
    }

    setUploadFile(file);
    setUploadTitle((prev) => prev || getDefaultTitle(file.name));
  };

  return (
    <ResponsiveLayout headerTitle="Documentos" headerSubtitle="Arquivo institucional e contratos">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground flex items-center justify-between gap-3">
          <span>
            {!hasClientObra
              ? "Sem obra vinculada."
              : isLoading
                ? "Carregando documentos da obra..."
                : `Documentos carregados: ${documentosData.length}`}
          </span>
          <Button size="sm" onClick={() => setIsUploadOpen(true)}>
            Enviar arquivo
          </Button>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar documento..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 bg-white border-border/50"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
        >
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category === "Todos" ? null : category)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${(category === "Todos" ? selectedCategory === null : selectedCategory === category)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
            >
              {category}
            </button>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card-institutional p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-primary">Status de Assinaturas</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <p className="text-xl font-bold text-foreground">{signatureCounts.requires}</p>
              <p className="text-[10px] text-muted-foreground">Requerem assinatura</p>
            </div>
            <div className="text-center p-2 bg-amber-50 rounded-lg">
              <p className="text-xl font-bold text-amber-600">{signatureCounts.waiting}</p>
              <p className="text-[10px] text-muted-foreground">Aguardando</p>
            </div>
            <div className="text-center p-2 bg-emerald-50 rounded-lg">
              <p className="text-xl font-bold text-emerald-600">{signatureCounts.signed}</p>
              <p className="text-[10px] text-muted-foreground">Assinados</p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">
              {documentosData.length} documento{documentosData.length !== 1 ? "s" : ""}
            </h2>
            <Filter className="w-4 h-4 text-muted-foreground" />
          </div>

          {!isLoading && documentosData.length === 0 && (
            <div className="card-institutional p-4 text-sm text-muted-foreground">Nenhum documento encontrado.</div>
          )}

          {documentosData.map((doc, index) => {
            const signatureStatus = toViewStatus(doc);
            const status = signatureStatusConfig[signatureStatus];
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
                    <h3 className="font-medium text-foreground text-sm truncate">{doc.titulo}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{doc.categoria}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                        {doc.requerAssinatura && doc.assinaturaStatus === "ASSINADO" && (
                          <Shield className="w-3 h-3 text-emerald-600" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatBytes(doc.fileSizeBytes)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => {
                      setSelectedDocumentId(doc.id);
                      setIsDetailOpen(true);
                    }}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    Detalhes
                  </Button>
                  {doc.requerAssinatura && doc.assinaturaStatus === "AGUARDANDO" ? (
                    <Button variant="default" size="sm" className="flex-1 text-xs" disabled>
                      <PenTool className="w-3.5 h-3.5 mr-1.5" />
                      Assinar
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 text-xs"
                      disabled={downloadMutation.isPending}
                      onClick={() => handleDocumentDownload(doc)}
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

      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl p-0">
          <div className="flex flex-col h-full">
            <SheetHeader className="p-4 border-b border-border bg-primary text-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-white text-lg">{selectedDocument?.titulo ?? "Carregando..."}</SheetTitle>
              </div>
              {selectedDocument && (
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${signatureStatusConfig[toViewStatus(selectedDocument)].bgColor} ${signatureStatusConfig[toViewStatus(selectedDocument)].color}`}
                  >
                    {signatureStatusConfig[toViewStatus(selectedDocument)].label}
                  </span>
                  <span className="text-xs text-white/70">{selectedDocument.certificado?.id ?? "—"}</span>
                </div>
              )}
            </SheetHeader>

            <Tabs defaultValue="info" className="flex-1 overflow-hidden">
              <TabsList className="w-full justify-start px-4 pt-2 bg-transparent border-b rounded-none">
                <TabsTrigger value="info" className="text-xs">Informações</TabsTrigger>
                <TabsTrigger value="signatures" className="text-xs">Assinaturas</TabsTrigger>
                <TabsTrigger value="audit" className="text-xs">Auditoria</TabsTrigger>
                <TabsTrigger value="versions" className="text-xs">Versões</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-4">
                {loadingDetail && !selectedDocument ? (
                  <div className="space-y-3">
                    <div className="h-28 rounded-xl bg-muted animate-pulse" />
                    <div className="h-20 rounded-xl bg-muted animate-pulse" />
                  </div>
                ) : (
                  <>
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
                            <p className="font-medium">{selectedDocument?.categoria ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Tamanho</p>
                            <p className="font-medium">{formatBytes(selectedDocument?.fileSizeBytes ?? 0)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Data</p>
                            <p className="font-medium">{formatDate(selectedDocument?.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Requer Assinatura</p>
                            <p className="font-medium">{selectedDocument?.requerAssinatura ? "Sim" : "Não"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="card-institutional p-4 bg-emerald-50 border-emerald-200">
                        <div className="flex items-center gap-2 mb-3">
                          <Shield className="w-5 h-5 text-emerald-600" />
                          <span className="text-sm font-semibold text-emerald-700">Certificado de Assinatura</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-emerald-600">ID do Certificado</span>
                            <span className="font-mono font-medium text-emerald-800">{selectedDocument?.certificado?.id ?? "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-emerald-600">Validade Jurídica</span>
                            <span className="font-medium text-emerald-800">{selectedDocument?.certificado?.validadeJuridica ?? "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-emerald-600">Hash do Documento</span>
                            <span className="font-mono text-xs text-emerald-800">{selectedDocument?.certificado?.hash ?? "—"}</span>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="signatures" className="mt-0 space-y-3">
                      {(assinaturasData.length ?? 0) > 0 ? (
                        assinaturasData.map((signer, idx) => (
                          <div key={`${signer.nome}-${idx}`} className="card-institutional p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`p-2 rounded-full ${signer.status === "ASSINADO" ? "bg-emerald-100" : "bg-amber-100"}`}>
                                  {signer.status === "ASSINADO" ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <Clock className="w-4 h-4 text-amber-600" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{signer.nome}</p>
                                  <p className="text-xs text-muted-foreground">{signer.papel}</p>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground">Assinado em:</span>
                                <span className="font-medium">{formatDateTime(signer.assinadoEm)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground">IP:</span>
                                <span className="font-mono">{signer.ip ?? "—"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Fingerprint className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground">Método:</span>
                                <span className="font-medium">{signer.metodo ?? "—"}</span>
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
                      {(auditoriaData.length ?? 0) > 0 ? (
                        <div className="relative">
                          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                          <div className="space-y-4">
                            {auditoriaData.map((event, idx) => (
                              <div key={`${event.titulo}-${idx}`} className="relative pl-10">
                                <div className="absolute left-2 w-4 h-4 rounded-full bg-primary border-2 border-white" />
                                <div className="card-institutional p-3">
                                  <p className="font-medium text-sm">{event.titulo}</p>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                    <span>{formatDateTime(event.createdAt)}</span>
                                    <span>•</span>
                                    <span>{event.por}</span>
                                    {event.ip && (
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
                      {(versoesData.length ?? 0) > 0 ? (
                        versoesData.map((version, idx) => (
                          <div key={`${version.versao}-${idx}`} className="card-institutional p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-sm">Versão {version.versao}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(version.createdAt)}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{version.descricao}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              <User className="w-3 h-3 inline mr-1" />
                              {version.por}
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
                  </>
                )}
              </div>
            </Tabs>

            <div className="p-4 border-t border-border bg-white">
              <Button
                variant="secondary"
                className="w-full"
                disabled={!selectedDocument || downloadMutation.isPending}
                onClick={() => selectedDocument && handleDocumentDownload(selectedDocument)}
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar Documento
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar arquivo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="arquivo">Arquivo</Label>
              <Input id="arquivo" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => handleFileChange(e.target.files?.[0])} />
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={uploadCategory} onValueChange={(value) => setUploadCategory(value as DocumentoCategoria)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="requerAssinatura" checked={requiresSignature} onCheckedChange={(value) => setRequiresSignature(Boolean(value))} />
              <Label htmlFor="requerAssinatura">Requer assinatura</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsUploadOpen(false)}>
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
              <Button onClick={handleUploadSubmit} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? <Clock className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {downloadMutation.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 card-institutional px-4 py-2 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-primary" />
            Preparando download...
          </motion.div>
        )}
      </AnimatePresence>
    </ResponsiveLayout>
  );
};

export default Documentos;
