import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { Loader2, Trash2, UploadCloud } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface UploadState {
  progress: number;
  state: "idle" | "uploading" | "success" | "error";
  error?: string;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const normalizeObraSlug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "obra-sem-nome";

const isSupportedType = (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (file.type.startsWith("image/")) return true;

  const allowedExtensions = ["pdf", "doc", "docx", "xls", "xlsx", "txt"];
  return allowedExtensions.includes(extension);
};

const getFileId = (file: File) => `${file.name}_${file.size}_${file.lastModified}`;

const UploadPage = () => {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [obra, setObra] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});

  const hasErrors = useMemo(
    () => Object.values(uploads).some((upload) => upload.state === "error"),
    [uploads],
  );

  const addFiles = (incomingFiles: FileList | File[]) => {
    const fileArray = Array.from(incomingFiles);

    if (!fileArray.length) return;

    const nextFiles: File[] = [];
    const nextUploads: Record<string, UploadState> = {};

    for (const file of fileArray) {
      const fileId = getFileId(file);

      if (file.size === 0) {
        toast({
          title: "Arquivo inválido",
          description: `${file.name} está vazio e não pode ser enviado.`,
          variant: "destructive",
        });
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
      nextUploads[fileId] = { progress: 0, state: "idle" };
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

  const clearForm = () => {
    setFiles([]);
    setUploads({});
  };

  const handleUpload = async () => {
    const obraValue = obra.trim();

    if (!obraValue) {
      toast({
        title: "Campo obrigatório",
        description: "Informe a obra antes de enviar os arquivos.",
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

    const obraSlug = normalizeObraSlug(obraValue);

    try {
      await Promise.all(
        files.map(
          (file) =>
            new Promise<void>((resolve, reject) => {
              const fileId = getFileId(file);
              const timestamp = Date.now();
              const safeFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
              const storagePath = `documentos-teste/${obraSlug}/${user.uid}/${timestamp}_${safeFileName}`;

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
                    [fileId]: { ...previous[fileId], progress, state: "uploading" },
                  }));
                },
                (error) => {
                  setUploads((previous) => ({
                    ...previous,
                    [fileId]: {
                      progress: previous[fileId]?.progress ?? 0,
                      state: "error",
                      error: error.message,
                    },
                  }));
                  reject(error);
                },
                async () => {
                  try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    const contentType = file.type || "application/octet-stream";
                    const kind = contentType.startsWith("image/") ? "foto" : "documento";

                    await addDoc(collection(db, "documentos-teste"), {
                      obra: obraValue,
                      obraSlug,
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp(),
                      userUid: user.uid,
                      userEmail: user.email,
                      fileName: file.name,
                      contentType,
                      size: file.size,
                      kind,
                      storagePath,
                      downloadURL,
                      status: "ativo",
                    });

                    setUploads((previous) => ({
                      ...previous,
                      [fileId]: { progress: 100, state: "success" },
                    }));

                    resolve();
                  } catch (error) {
                    const message = error instanceof Error ? error.message : "Erro ao registrar documento";
                    setUploads((previous) => ({
                      ...previous,
                      [fileId]: {
                        progress: previous[fileId]?.progress ?? 0,
                        state: "error",
                        error: message,
                      },
                    }));
                    reject(error);
                  }
                },
              );
            }),
        ),
      );

      toast({
        title: "Upload concluído",
        description: "Arquivos enviados e registrados com sucesso.",
      });
      clearForm();
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
              Informe a obra, adicione os arquivos e envie para armazenamento no Firebase Storage com registro no Firestore.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="obra" className="text-sm font-medium">
                Obra <span className="text-destructive">*</span>
              </label>
              <Input
                id="obra"
                placeholder="Ex: Residencial Vista Sul"
                value={obra}
                onChange={(event) => setObra(event.target.value)}
                disabled={isUploading}
              />
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeFile(file)}
                          disabled={isUploading}
                        >
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
                              upload.state === "success" && "text-emerald-600",
                            )}
                          >
                            {upload.state === "success" && "Concluído"}
                            {upload.state === "error" && `Erro: ${upload.error ?? "falha no upload"}`}
                            {(upload.state === "idle" || upload.state === "uploading") &&
                              `${Math.round(upload.progress)}%`}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={clearForm} disabled={isUploading || (!files.length && !obra)}>
                Limpar
              </Button>
              <Button onClick={handleUpload} disabled={isUploading || !files.length}>
                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar
              </Button>
            </div>

            {/*
              Regras sugeridas (não aplicadas automaticamente):
              - Storage: permitir leitura/escrita em documentos-teste apenas para usuários autenticados.
              - Storage (opcional): validar request.resource.size <= 20MB e contentType permitido.
              - Firestore (documentos-teste): allow read, create: if request.auth != null.
              - Firestore (opcional): allow update, delete apenas se request.auth.uid == resource.data.userUid.
            */}

            {hasErrors && (
              <p className="text-xs text-destructive">
                Alguns arquivos falharam. Remova os arquivos com erro e tente novamente.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ResponsiveLayout>
  );
};

export default UploadPage;