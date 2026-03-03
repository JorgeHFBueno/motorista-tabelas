import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { Download, FileText, PenTool, UploadCloud } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useDocumentos, useFotos, useObra } from "@/hooks/useAppQueries";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase";
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
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string>("");
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

  const downloadUrl = useMemo(
    () => asText(selectedDocument?.url) || resolvedDownloadUrl,
    [resolvedDownloadUrl, selectedDocument],
  );

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

  const openDetails = async (item: FirestoreItem) => {
    setSelectedDocument(item);
    setResolvedDownloadUrl("");
    setIsDetailOpen(true);
    if (!asText(item.url) && asText(item.storagePath)) {
      try {
        const url = await getDownloadURL(ref(storage, asText(item.storagePath)));
        setResolvedDownloadUrl(url);
      } catch {
        // noop
      }
    }
  };

  return (
    <ResponsiveLayout headerTitle={obra?.nome ?? "Detalhe da obra"} headerSubtitle="Documentos e fotos por obra">
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <div className="mb-4 flex justify-end">
          <Button onClick={() => navigate(`/painel/obras/${obraId}/upload`)}>Enviar arquivo</Button>
        </div>
        <Tabs defaultValue="documentos" className="space-y-4">
          <TabsList>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="fotos">Fotos</TabsTrigger>
          </TabsList>
          <TabsContent value="documentos" className="rounded-xl border p-4 space-y-3">
            {isLoadingDocs ? "Carregando documentos..." : `Total documentos: ${documentos.length}`}
            {documentos.map((docItem) => (
              <div key={String(docItem.id)} className="flex items-center justify-between rounded border p-2">
                <div>
                  <p className="text-sm font-medium">{getDisplayName(docItem)}</p>
                  <p className="text-xs text-muted-foreground">{asText(docItem.tipo) || asText(docItem.categoria) || "Documento"}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void openDetails(docItem)}>Detalhes</Button>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="fotos" className="rounded-xl border p-4">
            {isLoadingFotos ? "Carregando fotos..." : `Total fotos: ${fotos.length}`}
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
              <TabsTrigger value="signatures">Assinaturas</TabsTrigger>
              <TabsTrigger value="audit">Auditoria</TabsTrigger>
              <TabsTrigger value="versions">Versões</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-2 text-sm">
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

            <TabsContent value="signatures" className="space-y-2 text-sm">
              <Button onClick={() => signMutation.mutate()} disabled={signMutation.isPending || !selectedDocument}>
                <PenTool className="mr-2 h-4 w-4" /> Assinar
              </Button>
              {assinaturas.length === 0 ? <p>Sem assinaturas.</p> : assinaturas.map((sign) => (
                <div key={String(sign.id)} className="rounded border p-2">
                  <p>{asText(sign.signedByNomeSnapshot) || asText(sign.nome) || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground">Status: {asText(sign.status) || "—"} • {toDateTime(sign.createdAt)}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="audit" className="space-y-2 text-sm">
              {auditoria.length === 0 ? <p>Sem eventos de auditoria.</p> : auditoria.map((event) => (
                <div key={String(event.id)} className="rounded border p-2">
                  <p>{asText(event.type) || asText(event.titulo) || "evento"}</p>
                  <p className="text-xs text-muted-foreground">{asText(event.actorNomeSnapshot) || asText(event.por) || "Sistema"} • {toDateTime(event.createdAt)}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="versions" className="space-y-2 text-sm">
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
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </ResponsiveLayout>
  );
};

export default StaffObraDetailPage;