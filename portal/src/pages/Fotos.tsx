import { useEffect, useMemo, useState } from "react";
import type { FirestoreError } from "firebase/firestore";
import { motion } from "framer-motion";
import { Calendar, Download, Layers, X, ZoomIn } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useActiveObraId } from "@/hooks/useActiveObraId";
import { useToast } from "@/hooks/use-toast";
import { useDownloadFoto, useFotosList, useUploadFoto } from "@/lib/fotos/fotos.queries";
import { getFotoUrl } from "@/lib/fotos/fotos.service";
import { FOTO_ETAPA_LABELS, FOTO_ETAPAS, type Foto, type FotoEtapa } from "@/lib/fotos/fotos.types";

const FILTER_ALL = "TODAS";

type FilterEtapa = typeof FILTER_ALL | FotoEtapa;

const formatDate = (value?: { toDate?: () => Date }) =>
  value?.toDate ? value.toDate().toLocaleDateString("pt-BR") : "—";

const formatMonthYear = (date: Date) =>
  date
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^\p{L}/u, (c) => c.toUpperCase());

const Fotos = () => {
  const { activeObraId, hasClientObra } = useActiveObraId();
  const { toast } = useToast();
  const [selectedStage, setSelectedStage] = useState<FilterEtapa>(FILTER_ALL);
  const [selectedPhoto, setSelectedPhoto] = useState<Foto | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadEtapa, setUploadEtapa] = useState<FotoEtapa | "">("");
  const [uploadObservacao, setUploadObservacao] = useState("");

  const etapaFilter = selectedStage === FILTER_ALL ? null : selectedStage;
  const { data: fotosData = [], isLoading, isError, error } = useFotosList(activeObraId ?? undefined, etapaFilter);
  const uploadMutation = useUploadFoto();
  const downloadMutation = useDownloadFoto();

  useEffect(() => {
    const pending = fotosData.filter((foto) => foto.filePath && !previewUrls[foto.id]);
    if (pending.length === 0) return;

    let canceled = false;

    Promise.all(
      pending.map(async (foto) => {
        try {
          const url = await getFotoUrl(foto.filePath);
          return [foto.id, url] as const;
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error("[fotos] erro ao resolver URL da foto", { fotoId: foto.id, err });
          }
          return [foto.id, ""] as const;
        }
      }),
    ).then((pairs) => {
      if (canceled) return;
      setPreviewUrls((current) => {
        const next = { ...current };
        for (const [id, url] of pairs) {
          next[id] = url;
        }
        return next;
      });
    });

    return () => {
      canceled = true;
    };
  }, [fotosData, previewUrls]);

  const groupedByMonth = useMemo(() => {
    return fotosData.reduce(
      (acc, foto) => {
        const date = foto.createdAt?.toDate?.() ?? new Date();
        const key = formatMonthYear(date);
        if (!acc[key]) acc[key] = [];
        acc[key].push(foto);
        return acc;
      },
      {} as Record<string, Foto[]>,
    );
  }, [fotosData]);

  const totalCount = fotosData.length;
  const etapasCount = new Set(fotosData.map((foto) => foto.etapa)).size;
  const monthsCount = Object.keys(groupedByMonth).length;

  const resetUpload = () => {
    setUploadFile(null);
    setUploadEtapa("");
    setUploadObservacao("");
  };

  const handleUpload = async () => {
    if (!activeObraId) {
      toast({ title: "Sem obra ativa", description: "Selecione uma obra para enviar fotos.", variant: "destructive" });
      return;
    }

    if (!uploadFile || !uploadEtapa) {
      toast({ title: "Dados incompletos", description: "Selecione arquivo e etapa.", variant: "destructive" });
      return;
    }

    try {
      await uploadMutation.mutateAsync({
        file: uploadFile,
        obraId: activeObraId,
        etapa: uploadEtapa,
        observacaoTecnica: uploadObservacao,
      });
      toast({ title: "Foto enviada", description: "Upload concluído com sucesso." });
      setIsUploadOpen(false);
      resetUpload();
    } catch (err) {
      console.error("[fotos] erro no upload", err);
      toast({
        title: "Falha no upload",
        description: err instanceof Error ? err.message : "Não foi possível enviar a foto.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (foto: Foto) => {
    try {
      await downloadMutation.mutateAsync(foto);
    } catch (err) {
      console.error("[fotos] erro no download", err);
      toast({
        title: "Falha no download",
        description: err instanceof Error ? err.message : "Não foi possível baixar a foto.",
        variant: "destructive",
      });
    }
  };

  const queryErrorMessage =
    (error as FirestoreError | undefined)?.code === "failed-precondition"
      ? "Índice do Firestore necessário para esta consulta. Veja o console."
      : error instanceof Error
        ? error.message
        : null;

  return (
    <ResponsiveLayout headerTitle="Fotos" headerSubtitle="Registro visual da evolução da obra">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground flex items-center justify-between gap-3">
          <span>{!hasClientObra ? "Sem obra vinculada." : isLoading ? "Carregando fotos da obra..." : `Fotos carregadas: ${fotosData.length}`}</span>
           <Button size="sm" onClick={() => setIsUploadOpen(true)} disabled={!activeObraId}>
            Enviar arquivo
          </Button>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-3 gap-3 lg:gap-4">
          <div className="card-institutional p-3 lg:p-4 text-center">
            <p className="text-2xl lg:text-3xl font-bold text-primary">{totalCount}</p>
            <p className="text-xs lg:text-sm text-muted-foreground">Total</p>
          </div>
          <div className="card-institutional p-3 lg:p-4 text-center">
            <p className="text-2xl lg:text-3xl font-bold text-secondary">{etapasCount}</p>
            <p className="text-xs lg:text-sm text-muted-foreground">Etapas</p>
          </div>
          <div className="card-institutional p-3 lg:p-4 text-center">
            <p className="text-2xl lg:text-3xl font-bold text-foreground">{monthsCount}</p>
            <p className="text-xs lg:text-sm text-muted-foreground">Meses</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex gap-2 lg:gap-3 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide lg:flex-wrap"
        >
          <button
            onClick={() => setSelectedStage(FILTER_ALL)}
            className={`px-3 py-1.5 lg:px-4 lg:py-2 rounded-full text-xs lg:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              selectedStage === FILTER_ALL ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Layers className="w-3 h-3 lg:w-4 lg:h-4" />
            Todas
          </button>

          {FOTO_ETAPAS.map((etapa) => (
            <button
              key={etapa}
              onClick={() => setSelectedStage(etapa)}
              className={`px-3 py-1.5 lg:px-4 lg:py-2 rounded-full text-xs lg:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                selectedStage === etapa ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Layers className="w-3 h-3 lg:w-4 lg:h-4" />
              {FOTO_ETAPA_LABELS[etapa]}
            </button>
          ))}
        </motion.div>

        {isError && queryErrorMessage && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{queryErrorMessage}</div>}

        {!isLoading && !isError && fotosData.length === 0 && (
          <div className="card-institutional p-4 text-sm text-muted-foreground">
            {activeObraId ? "Nenhuma foto encontrada para esta obra." : "Selecione uma obra para visualizar fotos."}
          </div>
        )}
        <div className="space-y-6 lg:space-y-8">
          {Object.entries(groupedByMonth).map(([monthYear, monthPhotos], groupIndex) => (
             <motion.div key={monthYear} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + groupIndex * 0.1 }}>
              <div className="flex items-center gap-2 mb-3 lg:mb-4">
                <Calendar className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
                <h2 className="text-sm lg:text-base font-semibold text-primary">{monthYear}</h2>
                <span className="text-xs lg:text-sm text-muted-foreground">({monthPhotos.length} fotos)</span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
                {monthPhotos.map((photo, index) => (
                  <motion.button
                    type="button"
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.25 + index * 0.05 }}
                    onClick={() => setSelectedPhoto(photo)}
                    className="card-institutional overflow-hidden cursor-pointer group text-left"
                  >
                    <div className="relative aspect-[4/3] bg-muted/40">
                      {previewUrls[photo.id] ? (
                        <img src={previewUrls[photo.id]} alt={`${photo.etapa} - ${formatDate(photo.createdAt)}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full animate-pulse bg-muted" />
                      )}
                      <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-6 h-6 lg:w-8 lg:h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="p-2.5 lg:p-3">
                      <Badge variant="outline" className="text-xs mb-1.5">
                        {photo.etapaLabel ?? FOTO_ETAPA_LABELS[photo.etapa]}
                      </Badge>
                      <p className="text-xs lg:text-sm text-muted-foreground">{formatDate(photo.createdAt)}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar arquivo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="foto-file">Arquivo</Label>
              <Input
                id="foto-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (!file) {
                    setUploadFile(null);
                    return;
                  }
                  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                    toast({ title: "Arquivo inválido", description: "Envie apenas JPG/JPEG/PNG/WEBP.", variant: "destructive" });
                    return;
                  }
                  setUploadFile(file);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select value={uploadEtapa} onValueChange={(value) => setUploadEtapa(value as FotoEtapa)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {FOTO_ETAPAS.map((etapa) => (
                    <SelectItem key={etapa} value={etapa}>
                      {FOTO_ETAPA_LABELS[etapa]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="foto-observacao">Observação Técnica</Label>
              <Textarea
                id="foto-observacao"
                value={uploadObservacao}
                onChange={(e) => setUploadObservacao(e.target.value)}
                placeholder="Detalhes técnicos (opcional)"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleUpload} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedPhoto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="flex justify-end gap-2 p-4 lg:p-6">
            <Button
              size="icon"
              variant="secondary"
              className="bg-white/10 hover:bg-white/20"
              onClick={(event) => {
                event.stopPropagation();
                void handleDownload(selectedPhoto);
              }}
            >
              <Download className="w-4 h-4 text-white" />
            </Button>
            <button onClick={() => setSelectedPhoto(null)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
              <X className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </button>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-4 lg:p-8" onClick={(e) => e.stopPropagation()}>
            {previewUrls[selectedPhoto.id] && (
              <img
                src={previewUrls[selectedPhoto.id]}
                alt={`${selectedPhoto.etapa} - ${formatDate(selectedPhoto.createdAt)}`}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            )}
          </div>
          
         <div className="p-4 lg:p-6 bg-black/30 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">{selectedPhoto.etapaLabel ?? FOTO_ETAPA_LABELS[selectedPhoto.etapa]}</Badge>
              <p className="text-white/70 text-sm lg:text-base">{formatDate(selectedPhoto.createdAt)}</p>
            </div>
          <p className="text-sm lg:text-base font-medium text-white mb-1">Observação Técnica</p>
            <p className="text-sm lg:text-base text-white/80">{selectedPhoto.observacaoTecnica || "Sem observações."}</p>
          </div>
        </motion.div>
      )}
    </ResponsiveLayout>
  );
};

export default Fotos;
