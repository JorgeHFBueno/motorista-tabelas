import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Timestamp, addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { ChevronDown, Download, PenTool, Trash2, UploadCloud } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDocumentos, useFotos, useObra } from "@/hooks/useAppQueries";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase";
import { getItemPreviewUrl, listTrashItems, moveToTrash, restoreFromTrash, type TrashType } from "@/lib/trash/trash.service";
import { getCallableErrorMessage } from "@/lib/functions";
import { bootstrapStatusIfEmpty, listFases, setDatas, toggleItem, type ObraStatusFase } from "@/services/obraStatus.service";
import type { FirestoreItem } from "@/types/rbac";

const UUID_PREFIX_NAME_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(.+)$/i;


interface SignatureItem {
  id: string;
  signedByNomeSnapshot?: string;
  nome?: string;
  status?: string;
  createdAt?: unknown;
}

interface AuditItem {
  id: string;
  type?: string;
  titulo?: string;
  actorNomeSnapshot?: string;
  por?: string;
  createdAt?: unknown;
}

interface VersionItem {
  id: string;
  versionNumber?: number;
  versao?: string;
  createdByNomeSnapshot?: string;
  por?: string;
  createdAt?: unknown;
}

const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value : "");
const toDateTime = (value: unknown) => {
  const cast = value as { toDate?: () => Date; seconds?: number };
  if (typeof cast?.toDate === "function") return cast.toDate().toLocaleString("pt-BR");
  if (typeof cast?.seconds === "number") return new Date(cast.seconds * 1000).toLocaleString("pt-BR");
  return "—";
};

const getDisplayName = (item: FirestoreItem) => {
  const direct = asText(item.displayName) || asText(item.originalName);
  if (direct) return direct;
  const candidate = asText(item.storedName) || asText(item.filename) || asText(item.fileName) || asText(item.titulo);
  if (!candidate) return "Documento";
  const match = candidate.match(UUID_PREFIX_NAME_REGEX);
  return match?.[1] ?? candidate;
};

const listSubcollection = async <T extends { id: string }>(docId: string, path: "assinaturas" | "auditoria" | "versoes"): Promise<T[]> => {
  const snap = await getDocs(query(collection(db, "documentos", docId, path), orderBy("createdAt", "desc")));
  return snap.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) })) as T[];
};

const StaffObraDetailPage = () => {
  const { obraId } = useParams();
  const { data: obra } = useObra(obraId);
  const { data: documentos = [], isLoading: isLoadingDocs } = useDocumentos(obraId);
  const { data: fotos = [], isLoading: isLoadingFotos } = useFotos(obraId);
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [selectedDocument, setSelectedDocument] = useState<FirestoreItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<TrashType>("documentos");
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string>("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [trashCandidate, setTrashCandidate] = useState<{ item: FirestoreItem; type: TrashType } | null>(null);
  const [trashTab, setTrashTab] = useState<TrashType>("documentos");
  const [activeTab, setActiveTab] = useState("documentos");
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const versionInputRef = useRef<HTMLInputElement>(null);

  const selectedDocId = asText(selectedDocument?.id);

  const { data: assinaturas = [] } = useQuery({
    queryKey: ["documentos", selectedDocId, "assinaturas"],
    queryFn: () => listSubcollection<SignatureItem>(selectedDocId, "assinaturas"),
    enabled: Boolean(selectedDocId && isDetailOpen),
  });

  const { data: auditoria = [] } = useQuery({
    queryKey: ["documentos", selectedDocId, "auditoria"],
    queryFn: () => listSubcollection<AuditItem>(selectedDocId, "auditoria"),
    enabled: Boolean(selectedDocId && isDetailOpen),
  });

  const { data: versoes = [] } = useQuery({
    queryKey: ["documentos", selectedDocId, "versoes"],
    queryFn: () => listSubcollection<VersionItem>(selectedDocId, "versoes"),
    enabled: Boolean(selectedDocId && isDetailOpen),
  });

  const { data: trashedDocuments = [] } = useQuery({
    queryKey: ["documentos-lixo", obraId],
    queryFn: () => listTrashItems({ obraId: obraId as string, type: "documentos" }),
    enabled: Boolean(obraId),
  });

  const { data: trashedPhotos = [] } = useQuery({
    queryKey: ["fotos-lixo", obraId],
    queryFn: () => listTrashItems({ obraId: obraId as string, type: "fotos" }),
    enabled: Boolean(obraId),
  });

  const { data: fases = [] } = useQuery({
    queryKey: ["obraStatus", obraId],
    queryFn: () => listFases(obraId as string),
    enabled: Boolean(obraId && activeTab === "status"),
  });

  const downloadUrl = useMemo(
    () => asText(selectedDocument?.url) || resolvedDownloadUrl,
    [resolvedDownloadUrl, selectedDocument],
  );

  const actor = useMemo(
    () => ({ uid: user?.uid ?? "", nome: userDoc?.nome ?? "Equipe" }),
    [user?.uid, userDoc?.nome],
  );

  useEffect(() => {
    if (!obraId || activeTab !== "status" || !user?.uid) return;

    void bootstrapStatusIfEmpty(obraId, actor)
      .then((created) => {
        if (created) return queryClient.invalidateQueries({ queryKey: ["obraStatus", obraId] });
        return Promise.resolve();
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.error("[STATUS] falha no bootstrap", { obraId, error });
        toast({ title: "Falha ao carregar status", description: "Não foi possível inicializar as fases.", variant: "destructive" });
      });
  }, [activeTab, actor, obraId, queryClient, toast, user?.uid]);

  const toggleItemMutation = useMutation({
    mutationFn: ({ faseId, itemId }: { faseId: string; itemId: string }) => toggleItem(obraId as string, faseId, itemId, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["obraStatus", obraId] });
    },
    onError: (error) => {
      toast({ title: "Falha ao atualizar item", description: error instanceof Error ? error.message : "Erro inesperado.", variant: "destructive" });
    },
  });

  const setDatasMutation = useMutation({
    mutationFn: ({ faseId, inicio, fim }: { faseId: string; inicio: Timestamp | null; fim: Timestamp | null }) =>
      setDatas(obraId as string, faseId, inicio, fim, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["obraStatus", obraId] });
    },
    onError: (error) => {
      toast({ title: "Falha ao atualizar datas", description: error instanceof Error ? error.message : "Erro inesperado.", variant: "destructive" });
    },
  });

  const getProgress = (fase: ObraStatusFase) => {
    const total = fase.itens?.length ?? 0;
    if (!total) return 0;
    const completed = fase.itens.filter((item) => item.done).length;
    return Math.round((completed / total) * 100);
  };

  const getStatusMeta = (progress: number) => {
    if (progress === 0) return { label: "Pendente", variant: "outline" as const };
    if (progress === 100) return { label: "Concluída", variant: "default" as const };
    return { label: "Em andamento", variant: "secondary" as const };
  };

  const formatDateInput = (value: unknown) => {
    const cast = value as { toDate?: () => Date; seconds?: number };
    let date: Date | null = null;
    if (typeof cast?.toDate === "function") date = cast.toDate();
    else if (typeof cast?.seconds === "number") date = new Date(cast.seconds * 1000);
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const toTimestampFromInput = (value: string) => {
    if (!value) return null;
    return Timestamp.fromDate(new Date(`${value}T00:00:00`));
  };

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDocId || !user) throw new Error("Documento inválido ou sessão expirada.");
      await addDoc(collection(db, "documentos", selectedDocId, "assinaturas"), {
        createdAt: serverTimestamp(),
        signedByUid: user.uid,
        signedByNomeSnapshot: userDoc?.nome ?? null,
        status: "signed",
      });
      await addDoc(collection(db, "documentos", selectedDocId, "auditoria"), {
        type: "sign",
        actorUid: user.uid,
        actorNomeSnapshot: userDoc?.nome ?? null,
        createdAt: serverTimestamp(),
        meta: null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documentos", selectedDocId, "assinaturas"] });
      await queryClient.invalidateQueries({ queryKey: ["documentos", selectedDocId, "auditoria"] });
      toast({ title: "Documento assinado", description: "Assinatura registrada com sucesso." });
    },
    onError: (error) => {
      toast({ title: "Falha ao assinar", description: error instanceof Error ? error.message : "Erro de permissão.", variant: "destructive" });
    },
  });

  const uploadVersionMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedDocId || !user || !obraId) throw new Error("Não foi possível enviar versão.");
      const safeName = file.name.replace(/[\\/\s]+/g, "_");
      const storedName = `${crypto.randomUUID()}_${safeName}`;
      const storagePath = `obras/${obraId}/documentos/versoes/${selectedDocId}/${storedName}`;
      const storageRef = ref(storage, storagePath);

      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
        task.on("state_changed", undefined, reject, () => resolve());
      });

      const url = await getDownloadURL(storageRef);
      const nextVersion = versoes.length + 1;

      await addDoc(collection(db, "documentos", selectedDocId, "versoes"), {
        versionNumber: nextVersion,
        createdAt: serverTimestamp(),
        createdByUid: user.uid,
        createdByNomeSnapshot: userDoc?.nome ?? null,
        url,
        storagePath,
        storedName,
        originalName: file.name,
        displayName: file.name,
      });

      await addDoc(collection(db, "documentos", selectedDocId, "auditoria"), {
        type: "version_upload",
        actorUid: user.uid,
        actorNomeSnapshot: userDoc?.nome ?? null,
        createdAt: serverTimestamp(),
        meta: { versionNumber: nextVersion },
      });

      await updateDoc(doc(db, "documentos", selectedDocId), {
        latestVersion: nextVersion,
        latestUrl: url,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documentos", selectedDocId, "versoes"] });
      await queryClient.invalidateQueries({ queryKey: ["documentos", selectedDocId, "auditoria"] });
      await queryClient.invalidateQueries({ queryKey: ["documentos", obraId] });
      toast({ title: "Nova versão enviada", description: "Versão registrada com sucesso." });
    },
    onError: (error) => {
      toast({ title: "Falha ao enviar versão", description: error instanceof Error ? error.message : "Erro no envio.", variant: "destructive" });
    },
  });

  const trashMutation = useMutation({
    mutationFn: async ({ item, type }: { item: FirestoreItem; type: TrashType }) => {
      if (!obraId) throw new Error("Obra inválida.");
      const sizeBytes = Number(item.fileSizeBytes ?? item.sizeBytes ?? 0);
      if (sizeBytes > 15 * 1024 * 1024) {
        toast({ title: "Arquivo grande", description: "Mover para lixeira pode demorar para arquivos acima de 15MB." });
      }
      await moveToTrash({ item, type, obraId, userName: userDoc?.nome });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documentos", obraId] }),
        queryClient.invalidateQueries({ queryKey: ["fotos", obraId] }),
        queryClient.invalidateQueries({ queryKey: ["documentos-lixo", obraId] }),
        queryClient.invalidateQueries({ queryKey: ["fotos-lixo", obraId] }),
      ]);
      setTrashCandidate(null);
      toast({ title: "Movido para lixeira", description: "O item foi movido e pode ser restaurado." });
    },
    onError: (error) => {
      toast({ title: "Falha ao mover para lixeira", description: getCallableErrorMessage(error, "Erro ao excluir item."), variant: "destructive" });
      if (import.meta.env.DEV) console.error("[TRASH] erro ao mover", error);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ item, type }: { item: FirestoreItem; type: TrashType }) => {
      if (!obraId) throw new Error("Obra inválida.");
      await restoreFromTrash({ item, type, obraId });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documentos", obraId] }),
        queryClient.invalidateQueries({ queryKey: ["fotos", obraId] }),
        queryClient.invalidateQueries({ queryKey: ["documentos-lixo", obraId] }),
        queryClient.invalidateQueries({ queryKey: ["fotos-lixo", obraId] }),
      ]);
      toast({ title: "Item restaurado", description: "O item voltou para a coleção original." });
    },
    onError: (error) => {
      toast({ title: "Falha ao restaurar", description: getCallableErrorMessage(error, "Erro ao restaurar item."), variant: "destructive" });
      if (import.meta.env.DEV) console.error("[TRASH] erro ao restaurar", error);
    },
  });

  const openDetails = async (item: FirestoreItem, type: TrashType) => {
    setSelectedKind(type);
    setSelectedDocument(item);
    setResolvedDownloadUrl("");
    setIsPreviewLoading(true);
    setIsDetailOpen(true);
    try {
      const url = await getItemPreviewUrl(item);
      setResolvedDownloadUrl(url);
    } catch {
      if (import.meta.env.DEV) console.info(type === "fotos" ? "[PHOTOS] prévia indisponível" : "[DOCS] download url indisponível", { id: item.id });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  return (
    <ResponsiveLayout headerTitle={obra?.nome ?? "Detalhe da obra"} headerSubtitle="Documentos e fotos por obra">
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <div className="mb-4 flex justify-end">
          <Button onClick={() => navigate(`/painel/obras/${obraId}/upload`)}>Enviar arquivo</Button>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="fotos">Fotos</TabsTrigger>
            <TabsTrigger value="lixeira">Lixeira</TabsTrigger>
          </TabsList>
          <TabsContent value="documentos" className="rounded-xl border p-4 space-y-3">
            {isLoadingDocs ? "Carregando documentos..." : `Total documentos: ${documentos.length}`}
            {documentos.map((docItem) => (
              <div key={String(docItem.id)} className="flex items-center justify-between rounded border p-2">
                <div>
                  <p className="text-sm font-medium">{getDisplayName(docItem)}</p>
                  <p className="text-xs text-muted-foreground">{asText(docItem.tipo) || asText(docItem.categoria) || "Documento"}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void openDetails(docItem, "documentos")}>Detalhes</Button>
                  <Button variant="destructive" size="sm" onClick={() => setTrashCandidate({ item: docItem, type: "documentos" })}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="fotos" className="rounded-xl border p-4 space-y-3">
            {isLoadingFotos ? "Carregando fotos..." : `Total fotos: ${fotos.length}`}
            {fotos.map((fotoItem) => (
              <div key={String(fotoItem.id)} className="flex items-center justify-between rounded border p-2">
                <div>
                  <p className="text-sm font-medium">{getDisplayName(fotoItem)}</p>
                  <p className="text-xs text-muted-foreground">{asText(fotoItem.tipo) || asText(fotoItem.categoria) || "Foto"} • {toDateTime(fotoItem.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void openDetails(fotoItem, "fotos")}>Detalhes</Button>
                  <Button variant="destructive" size="sm" onClick={() => setTrashCandidate({ item: fotoItem, type: "fotos" })}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="lixeira" className="rounded-xl border p-4 space-y-3">
            <Tabs value={trashTab} onValueChange={(value) => setTrashTab(value as TrashType)}>
              <TabsList>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
                <TabsTrigger value="fotos">Fotos</TabsTrigger>
              </TabsList>
              <TabsContent value="documentos" className="space-y-3 mt-2">
                {trashedDocuments.length === 0 ? <p>Nenhum documento na lixeira.</p> : trashedDocuments.map((item) => (
                  <div key={String(item.id)} className="flex items-center justify-between rounded border p-2">
                    <div>
                      <p className="text-sm font-medium">{getDisplayName(item)}</p>
                      <p className="text-xs text-muted-foreground">Excluído em: {toDateTime(item.deletedAt)}</p>
                    </div>
                    <Button size="sm" onClick={() => restoreMutation.mutate({ item, type: "documentos" })}>Restaurar</Button>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="fotos" className="space-y-3 mt-2">
                {trashedPhotos.length === 0 ? <p>Nenhuma foto na lixeira.</p> : trashedPhotos.map((item) => (
                  <div key={String(item.id)} className="flex items-center justify-between rounded border p-2">
                    <div>
                      <p className="text-sm font-medium">{getDisplayName(item)}</p>
                      <p className="text-xs text-muted-foreground">Excluído em: {toDateTime(item.deletedAt)}</p>
                    </div>
                    <Button size="sm" onClick={() => restoreMutation.mutate({ item, type: "fotos" })}>Restaurar</Button>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="status" className="rounded-xl border p-4 space-y-3">
            {fases.length === 0 ? <p>Carregando status da obra...</p> : fases.map((fase) => {
              const progress = getProgress(fase);
              const statusMeta = getStatusMeta(progress);
              const isOpen = expandedPhases[fase.id] ?? true;
              return (
                <Collapsible
                  key={fase.id}
                  open={isOpen}
                  onOpenChange={(nextOpen) => setExpandedPhases((prev) => ({ ...prev, [fase.id]: nextOpen }))}
                  className="rounded border p-3"
                >
                  <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between gap-2 text-left">
                      <div className="space-y-1">
                        <p className="font-medium">{fase.titulo}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                          <span className="text-xs text-muted-foreground">{progress}%</span>
                        </div>
                      </div>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="mt-3 space-y-3">
                    <Progress value={progress} />

                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span>Início</span>
                        <Input
                          type="date"
                          defaultValue={formatDateInput(fase.inicio)}
                          onBlur={(event) => {
                            const inicio = toTimestampFromInput(event.target.value);
                            const fim = toTimestampFromInput(formatDateInput(fase.fim));
                            setDatasMutation.mutate({ faseId: fase.id, inicio, fim });
                          }}
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span>Fim</span>
                        <Input
                          type="date"
                          defaultValue={formatDateInput(fase.fim)}
                          onBlur={(event) => {
                            const inicio = toTimestampFromInput(formatDateInput(fase.inicio));
                            const fim = toTimestampFromInput(event.target.value);
                            setDatasMutation.mutate({ faseId: fase.id, inicio, fim });
                          }}
                        />
                      </label>
                    </div>

                    <div className="space-y-2">
                      {fase.itens.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={item.done}
                            onCheckedChange={() => toggleItemMutation.mutate({ faseId: fase.id, itemId: item.id })}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{selectedDocument ? getDisplayName(selectedDocument) : "Detalhes"}</SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="info" className="mt-4">
            <TabsList>
              <TabsTrigger value="info">Informações</TabsTrigger>
              {selectedKind === "documentos" && <TabsTrigger value="signatures">Assinaturas</TabsTrigger>}
              {selectedKind === "documentos" && <TabsTrigger value="audit">Auditoria</TabsTrigger>}
              {selectedKind === "documentos" && <TabsTrigger value="versions">Versões</TabsTrigger>}
            </TabsList>

            <TabsContent value="info" className="space-y-2 text-sm">
              {selectedKind === "fotos" && (
                <div className="mb-2">
                  {isPreviewLoading ? (
                    <div className="h-40 w-40 animate-pulse rounded-md bg-muted" />
                  ) : downloadUrl ? (
                    <img src={downloadUrl} alt={selectedDocument ? getDisplayName(selectedDocument) : "Prévia da foto"} className="h-40 w-40 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-40 w-40 items-center justify-center rounded-md border text-xs text-muted-foreground">Prévia indisponível</div>
                  )}
                </div>
              )}
              <p><strong>Nome:</strong> {selectedDocument ? getDisplayName(selectedDocument) : "—"}</p>
              <p><strong>Tipo:</strong> {asText(selectedDocument?.tipo) || asText(selectedDocument?.categoria) || "—"}</p>
              <p><strong>Content-Type:</strong> {asText(selectedDocument?.contentType) || asText(selectedDocument?.mimeType) || "—"}</p>
              <p><strong>Criado em:</strong> {toDateTime(selectedDocument?.createdAt)}</p>
              <p><strong>Criado por:</strong> {asText(selectedDocument?.createdByNomeSnapshot) || "—"}</p>
              <p><strong>Obra:</strong> {asText(selectedDocument?.obraId)} {asText(selectedDocument?.obraNomeSnapshot) ? `(${asText(selectedDocument?.obraNomeSnapshot)})` : ""}</p>
              <p><strong>Observação:</strong> {asText(selectedDocument?.observacao) || "—"}</p>
              <Button disabled={!downloadUrl} asChild>
                <a href={downloadUrl || "#"} target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-4 w-4" /> Download
                </a>
              </Button>
            </TabsContent>

            {selectedKind === "documentos" && <TabsContent value="signatures" className="space-y-2 text-sm">
              <Button onClick={() => signMutation.mutate()} disabled={signMutation.isPending || !selectedDocument}>
                <PenTool className="mr-2 h-4 w-4" /> Assinar
              </Button>
              {assinaturas.length === 0 ? <p>Sem assinaturas.</p> : assinaturas.map((sign) => (
                <div key={String(sign.id)} className="rounded border p-2">
                  <p>{asText(sign.signedByNomeSnapshot) || asText(sign.nome) || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground">Status: {asText(sign.status) || "—"} • {toDateTime(sign.createdAt)}</p>
                </div>
              ))}
            </TabsContent>}

            {selectedKind === "documentos" && <TabsContent value="audit" className="space-y-2 text-sm">
              {auditoria.length === 0 ? <p>Sem eventos de auditoria.</p> : auditoria.map((event) => (
                <div key={String(event.id)} className="rounded border p-2">
                  <p>{asText(event.type) || asText(event.titulo) || "evento"}</p>
                  <p className="text-xs text-muted-foreground">{asText(event.actorNomeSnapshot) || asText(event.por) || "Sistema"} • {toDateTime(event.createdAt)}</p>
                </div>
              ))}
            </TabsContent>}

            {selectedKind === "documentos" && <TabsContent value="versions" className="space-y-2 text-sm">
              <input
                ref={versionInputRef}
                type="file"
                className="hidden"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadVersionMutation.mutate(file);
                  event.target.value = "";
                }}
              />
              <Button variant="outline" onClick={() => versionInputRef.current?.click()} disabled={!selectedDocument || uploadVersionMutation.isPending}>
                <UploadCloud className="mr-2 h-4 w-4" /> Enviar nova versão
              </Button>
              {versoes.length === 0 ? <p>Sem versões.</p> : versoes.map((version) => (
                <div key={String(version.id)} className="rounded border p-2">
                  <p>Versão {asText(version.versionNumber) || asText(version.versao) || "1"}</p>
                  <p className="text-xs text-muted-foreground">{asText(version.createdByNomeSnapshot) || asText(version.por) || "Sistema"} • {toDateTime(version.createdAt)}</p>
                </div>
              ))}
            </TabsContent>}
          </Tabs>
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(trashCandidate)} onOpenChange={(open) => !open && setTrashCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover para lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              Este item não será excluído definitivamente e poderá ser restaurado na aba Lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (trashCandidate) trashMutation.mutate(trashCandidate);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveLayout>
  );
};

export default StaffObraDetailPage;