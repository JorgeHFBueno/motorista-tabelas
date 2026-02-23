import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { FileText, Loader2, UploadCloud } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useObraUpload } from "@/hooks/useObraUpload";
import { useObra } from "@/hooks/useAppQueries";
import { cn } from "@/lib/utils";
import { ACCEPTED_UPLOAD_MIME_TYPES, DOCUMENTO_TIPOS_PDF, FOTO_TIPOS_IMAGEM } from "@/constants/uploadTypes";
import type { DocumentoTipoPdf, FotoTipoImagem, UploadKind } from "@/types/upload";

const isAccepted = (file: File) => ACCEPTED_UPLOAD_MIME_TYPES.includes(file.type as (typeof ACCEPTED_UPLOAD_MIME_TYPES)[number]);

const StaffObraUploadPage = () => {
  const { obraId = "" } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: obra } = useObra(obraId);
  const { uploadImage, uploadPdf, isUploading } = useObraUpload(obraId);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tipo, setTipo] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [registroEm, setRegistroEm] = useState("");
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const uploadKind: UploadKind | null = useMemo(() => {
    if (!selectedFile) return null;
    if (selectedFile.type.startsWith("image/")) return "image";
    if (selectedFile.type === "application/pdf") return "pdf";
    return null;
  }, [selectedFile]);

  const availableTipos = useMemo(() => {
    if (uploadKind === "image") return FOTO_TIPOS_IMAGEM;
    if (uploadKind === "pdf") return DOCUMENTO_TIPOS_PDF;
    return [];
  }, [uploadKind]);

  const pickFile = (file: File | null) => {
    if (!file) return;
    if (!isAccepted(file)) {
      toast({
        title: "Formato inválido",
        description: "Aceitamos apenas PDF e imagens PNG/JPG/JPEG/WEBP.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    setTipo("");
    setProgress(0);
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    pickFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    pickFile(event.dataTransfer.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadKind) {
      toast({ title: "Arquivo obrigatório", description: "Selecione um arquivo para continuar.", variant: "destructive" });
      return;
    }

    if (!tipo) {
      toast({ title: "Tipo obrigatório", description: "Selecione o tipo do arquivo.", variant: "destructive" });
      return;
    }

    try {
      if (uploadKind === "pdf") {
        await uploadPdf({
          file: selectedFile,
          payload: {
            tipo: tipo as DocumentoTipoPdf,
            observacao,
            registroEm: registroEm || undefined,
          },
          onProgress: setProgress,
        });
      } else {
        await uploadImage({
          file: selectedFile,
          payload: {
            tipo: tipo as FotoTipoImagem,
            observacao,
            registroEm: registroEm || undefined,
          },
          onProgress: setProgress,
        });
      }

      toast({ title: "Upload concluído", description: "Arquivo enviado com sucesso para a obra." });
      navigate(`/painel/obras/${obraId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao enviar arquivo.";
      toast({ title: "Falha no upload", description: message, variant: "destructive" });
    }
  };

  return (
    <ResponsiveLayout headerTitle="Upload da obra" headerSubtitle={obra?.nome ?? "Envio contextual por obra"}>
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Enviar arquivo para obra</CardTitle>
            <CardDescription>
              O arquivo será registrado automaticamente na subcoleção da obra selecionada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="application/pdf,image/png,image/jpg,image/jpeg,image/webp"
              onChange={onFileInput}
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
                "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30",
              )}
            >
              <UploadCloud className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Arraste e solte ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground">PDF, PNG, JPG, JPEG, WEBP</p>
            </div>

            {selectedFile && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2">Preview</p>
                {uploadKind === "image" ? (
                  <div className="flex items-center gap-3">
                    <img src={URL.createObjectURL(selectedFile)} alt={selectedFile.name} className="h-20 w-20 rounded object-cover" />
                    <div>
                      <p className="text-sm">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">Imagem</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">PDF</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedFile && (
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={tipo} onValueChange={setTipo} disabled={isUploading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTipos.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Observação sobre o arquivo" />
            </div>

            <div className="space-y-2">
              <Label>Data do registro (opcional)</Label>
              <Input type="datetime-local" value={registroEm} onChange={(event) => setRegistroEm(event.target.value)} />
              <p className="text-xs text-muted-foreground">Se não informado, usamos o timestamp do servidor.</p>
            </div>

            {isUploading && <p className="text-xs text-muted-foreground">Enviando... {Math.round(progress)}%</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate(`/painel/obras/${obraId}`)} disabled={isUploading}>Cancelar</Button>
              <Button onClick={handleUpload} disabled={isUploading || !selectedFile || !tipo}>
                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar arquivo
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ResponsiveLayout>
  );
};

export default StaffObraUploadPage;