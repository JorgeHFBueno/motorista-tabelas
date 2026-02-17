import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Trash2, UploadCloud } from "lucide-react";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, getMetadata, ref, uploadBytesResumable } from "firebase/storage";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const DOCUMENT_TYPES = ["Contratos", "Aditivos", "Projetos", "ART / RRT", "Licenças", "Notas Fiscais", "Relatórios"];

type UploadStatus = "queued" | "uploading" | "done" | "error";

interface UploadState {
    progress: number;
  state: UploadStatus;
  error?: string;
}

interface ObraOption {
  id: string;
  nome: string;
}

const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const sanitizeFileName = (fileName: string) =>
  fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_");

const isSupportedType = (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (file.type.startsWith("image/")) return true;

    const allowedExtensions = ["pdf", "doc", "docx", "xls", "xlsx", "txt"];
  return allowedExtensions.includes(extension);
};

const getFileId = (file: File) => `${file.name}_${file.size}_${file.lastModified}`;

const UploadPage = () => {const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [obras, setObras] = useState<ObraOption[]>([]);
  const [isLoadingObras, setIsLoadingObras] = useState(true);
  const [obraId, setObraId] = useState("");
  const [obraNomeSnapshot, setObraNomeSnapshot] = useState("");
  const [obraComboboxOpen, setObraComboboxOpen] = useState(false);
  const [tipo, setTipo] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const hasErrors = useMemo(() => Object.values(uploads).some((upload) => upload.state === "error"), [uploads]);

  useEffect(() => {
    const loadObras = async () => {
      try {
        setIsLoadingObras(true);
        const obrasQuery = query(collection(db, "obras"), orderBy("nome", "asc"));
        const snapshot = await getDocs(obrasQuery);
        const obrasList = snapshot.docs.map((doc) => ({ id: doc.id, nome: String(doc.data().nome ?? "") }));
        setObras(obrasList.filter((obra) => obra.nome));
      } catch (error) {
        console.error("[upload] erro ao carregar obras", error);
        toast({
          title: "Não foi possível carregar as obras",
          description: "Verifique sua conexão e permissões do Firestore.",
          variant: "destructive",
        });

         } finally {
        setIsLoadingObras(false);
      }
    };

    void loadObras();
  }, []);

  const setFileError = (fileId: string, message: string) => {
    setUploads((previous) => ({
      ...previous,
      [fileId]: {
        progress: previous[fileId]?.progress ?? 0,
        state: "error",
        error: message,
      },
    }));
  };

  const addFiles = (incomingFiles: FileList | File[]) => {
    const fileArray = Array.from(incomingFiles);
    if (!fileArray.length) return;

    const nextFiles: File[] = [];
    const nextUploads: Record<string, UploadState> = {};

    for (const file of fileArray) {
      const fileId = getFileId(file);

      if (file.size === 0) {
        toast({ title: "Arquivo inválido", description: `${file.name} está vazio e não pode ser enviado.`, variant: "destructive" });
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name} excede o limite de 20MB por arquivo.`,
          variant: "destructive",
        });
    continue;
      }

      if (!isSupportedType(file)) {
        toast({
          title: "Tipo não suportado",
          description: `${file.name} não é um tipo permitido para upload.`,
          variant: "destructive",
        });
        continue;
      }

      nextFiles.push(file);
      nextUploads[fileId] = { progress: 0, state: "queued" };
    }

    if (!nextFiles.length) return;

    setFiles((previous) => {
      const seenIds = new Set(previous.map(getFileId));
      const unique = nextFiles.filter((file) => !seenIds.has(getFileId(file)));
      return [...previous, ...unique];
    });

    setUploads((previous) => ({ ...previous, ...nextUploads }));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const onSelectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    addFiles(event.target.files);
    event.target.value = "";
  };

  const removeFile = (fileToRemove: File) => {
    const fileId = getFileId(fileToRemove);
    setFiles((previous) => previous.filter((file) => getFileId(file) !== fileId));
    setUploads((previous) => {
      const next = { ...previous };
      delete next[fileId];
      return next;
    });
  };

  const clearFiles = () => {
    setFiles([]);
    setUploads({});
  };

  const handleUpload = async () => {
    if (!obraId || !obraNomeSnapshot) {
      toast({
        title: "Obra obrigatória",
        description: "Selecione uma obra antes de enviar os arquivos.",
        variant: "destructive",
      });
      return;
    }

    if (!tipo) {
      toast({
        title: "Tipo obrigatório",
        description: "Selecione o tipo do documento para continuar.",
        variant: "destructive",
      });
      return;
    }

    if (!files.length) {
      toast({
        title: "Nenhum arquivo selecionado",
        description: "Adicione ao menos um arquivo para enviar.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Sessão inválida",
        description: "Faça login novamente para enviar arquivos.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    const uploadFile = (file: File) =>
      new Promise<void>((resolve, reject) => {
        const fileId = getFileId(file);
        const timestamp = Date.now();
        const safeFileName = sanitizeFileName(file.name);
        const storagePath = `documentos/${obraId}/${user.uid}/${timestamp}_${safeFileName}`;

        try {
          const storageRef = ref(storage, storagePath);
          const uploadTask = uploadBytesResumable(storageRef, file);

        setUploads((previous) => ({
            ...previous,
            [fileId]: { progress: 0, state: "uploading" },
          }));

          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploads((previous) => ({
                ...previous,
                [fileId]: {
                  progress,
                  state: "uploading",
                },
              }));
            },
            (error) => {
              const message = error instanceof Error ? error.message : "Falha no upload";
              console.error(`[upload][${file.name}] erro no uploadBytesResumable`, error);
              setFileError(fileId, message);
              reject(error);
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                const metadata = await getMetadata(uploadTask.snapshot.ref);
                const contentType = file.type || metadata.contentType || "application/octet-stream";
                const kind = contentType.startsWith("image/") ? "foto" : "documento";

                await addDoc(collection(db, "documentos"), {
                  obraId,
                  obraNomeSnapshot,
                  tipo,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                  userUid: user.uid,
                  userEmail: user.email,
                  fileName: `${timestamp}_${safeFileName}`,
                  originalFileName: file.name,
                  contentType,
                  size: file.size,
                  kind,
                  storagePath,
                  downloadURL,
                  status: "ativo",
                  checksumMd5: metadata.md5Hash ?? null,
                  tags: [],
                });

        setUploads((previous) => ({
                  ...previous,
                  [fileId]: { progress: 100, state: "done" },
                }));
                resolve();
              } catch (error) {
                const firestoreErrorCode =
                  typeof error === "object" && error && "code" in error ? String(error.code) : "";

                const message =
                  firestoreErrorCode === "permission-denied"
                    ? "Sem permissão para registrar no Firestore. Revise as regras de segurança."
                    : "Erro ao registrar metadados no Firestore.";

                console.error(`[upload][${file.name}] erro ao finalizar upload`, error);
                setFileError(fileId, message);
                reject(error);
              }
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha ao iniciar upload";
          console.error(`[upload][${file.name}] erro inesperado ao iniciar upload`, error);
          setFileError(fileId, message);
          reject(error);
        }
        });

    try {
      await Promise.all(files.map((file) => uploadFile(file)));
      toast({ title: "Upload concluído", description: "Arquivos enviados e registrados com sucesso." });
      clearFiles();
    } catch {
      toast({
        title: "Falha no upload",
        description: "Alguns arquivos não foram enviados. Verifique os erros e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ResponsiveLayout headerTitle="Upload" headerSubtitle="Envio de documentos e fotos para a obra">
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Upload de documentos e fotos</CardTitle>
            <CardDescription>
              Selecione a obra e o tipo para vincular os arquivos e registrar metadados na coleção global de documentos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Obra <span className="text-destructive">*</span></Label>
              <Popover open={obraComboboxOpen} onOpenChange={setObraComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={obraComboboxOpen}
                    className="w-full justify-between"
                    disabled={isUploading || isLoadingObras}
                  >
                    {obraNomeSnapshot || (isLoadingObras ? "Carregando obras..." : "Selecione uma obra")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
                    <CommandInput placeholder="Buscar obra..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma obra encontrada.</CommandEmpty>
                      <CommandGroup>
                        {obras.map((obra) => (
                          <CommandItem
                            key={obra.id}
                            value={obra.nome}
                            onSelect={() => {
                              setObraId(obra.id);
                              setObraNomeSnapshot(obra.nome);
                              setObraComboboxOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", obraId === obra.id ? "opacity-100" : "opacity-0")} />
                            {obra.nome}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

        <div className="space-y-2">
              <Label>Tipo <span className="text-destructive">*</span></Label>
              <Select value={tipo} onValueChange={setTipo} disabled={isUploading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo do documento" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

        <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onSelectFiles}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            />

            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={cn(
                "cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors",
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30",
              )}
            >
              <UploadCloud className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Arraste e solte aqui ou clique para selecionar</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Formatos permitidos: imagens, PDF, DOC, DOCX, XLS, XLSX e TXT (até 20MB por arquivo)
              </p>
            </div>

    {files.length > 0 && (
              <div className="space-y-3">
                {files.map((file) => {
                  const fileId = getFileId(file);
                  const upload = uploads[fileId];

                  return (
                    <div key={fileId} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.type || "Tipo desconhecido"} • {formatBytes(file.size)}
                          </p>
                        </div>

                        <Button type="button" variant="outline" size="sm" onClick={() => removeFile(file)} disabled={isUploading}>
                          <Trash2 className="mr-1 h-4 w-4" />
                          Remover
                        </Button>
                      </div>

                      {upload && (
                        <div className="mt-3 space-y-1">
                          <Progress value={upload.progress} />
                          <p
                            className={cn(
                                "text-xs",
                              upload.state === "error" && "text-destructive",
                              upload.state === "done" && "text-emerald-600",
                            )}
                        >
                            {upload.state === "queued" && "Na fila"}
                            {upload.state === "uploading" && `${Math.round(upload.progress)}%`}
                            {upload.state === "done" && "Concluído"}
                            {upload.state === "error" && `Erro: ${upload.error ?? "falha no upload"}`}
                          </p>
                        </div>

                        )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={clearFiles} disabled={isUploading || !files.length}>
                Limpar arquivos
              </Button>
              <Button onClick={handleUpload} disabled={isUploading || !files.length || !obraId || !tipo}>
                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar
              </Button>
            </div>
        {hasErrors && <p className="text-xs text-destructive">Alguns arquivos falharam. Revise os erros e tente novamente.</p>}
          </CardContent>
        </Card>
      </div>
    </ResponsiveLayout>
  );
};

export default UploadPage;