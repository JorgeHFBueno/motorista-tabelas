import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Download, Layers, X, ZoomIn } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActiveObraId } from "@/hooks/useActiveObraId";
import { FOTO_ETAPA_LABELS, FOTO_ETAPAS, etapaLabel, useFotosList, type Foto, type FotoEtapa } from "@/lib/fotos/fotos";
import { urlDoArquivo } from "@/lib/portal";

const FILTER_ALL = "TODAS";

type FilterEtapa = typeof FILTER_ALL | FotoEtapa;

const formatDate = (value?: { toDate?: () => Date }) =>
  value?.toDate ? value.toDate().toLocaleDateString("pt-BR") : "—";

const formatMonthYear = (date: Date) =>
  date
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^\p{L}/u, (c) => c.toUpperCase());

const Fotos = () => {
  const { activeObraId } = useActiveObraId();
  const [selectedStage, setSelectedStage] = useState<FilterEtapa>(FILTER_ALL);
  const [selectedPhoto, setSelectedPhoto] = useState<Foto | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const etapaFilter = selectedStage === FILTER_ALL ? null : selectedStage;
  const { data: fotosData = [], isLoading, isError } = useFotosList(activeObraId, etapaFilter);

  // Download links are asked at read time (Storage Rules check the access); nothing is stored in Firestore.
  useEffect(() => {
    const pending = fotosData.filter((foto) => foto.arquivo && previewUrls[foto.id] === undefined);
    if (pending.length === 0) return;

    let canceled = false;
    Promise.all(pending.map(async (foto) => [foto.id, (await urlDoArquivo(foto.arquivo)) ?? ""] as const)).then(
      (pairs) => {
        if (canceled) return;
        setPreviewUrls((current) => ({ ...current, ...Object.fromEntries(pairs) }));
      },
    );

    return () => {
      canceled = true;
    };
  }, [fotosData, previewUrls]);

  const groupedByMonth = useMemo(
    () =>
      fotosData.reduce(
        (acc, foto) => {
          const key = formatMonthYear(foto.criadoEm?.toDate?.() ?? new Date());
          if (!acc[key]) acc[key] = [];
          acc[key].push(foto);
          return acc;
        },
        {} as Record<string, Foto[]>,
      ),
    [fotosData],
  );

  const totalCount = fotosData.length;
  const etapasCount = new Set(fotosData.map((foto) => foto.etapa)).size;
  const monthsCount = Object.keys(groupedByMonth).length;

  return (
    <ResponsiveLayout headerTitle="Fotos" headerSubtitle="Registro visual da evolução da obra">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
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
          {[FILTER_ALL, ...FOTO_ETAPAS].map((etapa) => (
            <button
              key={etapa}
              onClick={() => setSelectedStage(etapa as FilterEtapa)}
              className={`px-3 py-1.5 lg:px-4 lg:py-2 rounded-full text-xs lg:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                selectedStage === etapa ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Layers className="w-3 h-3 lg:w-4 lg:h-4" />
              {etapa === FILTER_ALL ? "Todas" : FOTO_ETAPA_LABELS[etapa as FotoEtapa]}
            </button>
          ))}
        </motion.div>

        {isError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Não foi possível carregar as fotos agora. Tente novamente em instantes.
          </div>
        )}

        {!isLoading && !isError && fotosData.length === 0 && (
          <div className="card-institutional p-4 text-sm text-muted-foreground">Nenhuma foto encontrada para esta obra.</div>
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
                        <img src={previewUrls[photo.id]} alt={`${etapaLabel(photo.etapa)} - ${formatDate(photo.criadoEm)}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full animate-pulse bg-muted" />
                      )}
                      <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-6 h-6 lg:w-8 lg:h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="p-2.5 lg:p-3">
                      <Badge variant="outline" className="text-xs mb-1.5">
                        {etapaLabel(photo.etapa)}
                      </Badge>
                      <p className="text-xs lg:text-sm text-muted-foreground">{formatDate(photo.criadoEm)}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {selectedPhoto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // z-[60]: above the phone bottom bar (z-50), which otherwise covers the date and the note.
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex flex-col"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="flex justify-end gap-2 p-4 lg:p-6">
            {previewUrls[selectedPhoto.id] ? (
              <Button asChild size="icon" variant="secondary" className="bg-white/10 hover:bg-white/20">
                <a
                  href={previewUrls[selectedPhoto.id]}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Abrir foto original"
                >
                  <Download className="w-4 h-4 text-white" />
                </a>
              </Button>
            ) : null}
            <button onClick={() => setSelectedPhoto(null)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
              <X className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 lg:p-8" onClick={(e) => e.stopPropagation()}>
            {previewUrls[selectedPhoto.id] && (
              <img
                src={previewUrls[selectedPhoto.id]}
                alt={`${etapaLabel(selectedPhoto.etapa)} - ${formatDate(selectedPhoto.criadoEm)}`}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            )}
          </div>

          <div className="p-4 lg:p-6 bg-black/30 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">{etapaLabel(selectedPhoto.etapa)}</Badge>
              <p className="text-white/70 text-sm lg:text-base">{formatDate(selectedPhoto.criadoEm)}</p>
            </div>
            <p className="text-sm lg:text-base font-medium text-white mb-1">Observação</p>
            <p className="text-sm lg:text-base text-white/80">{selectedPhoto.observacao || "Sem observações."}</p>
          </div>
        </motion.div>
      )}
    </ResponsiveLayout>
  );
};

export default Fotos;
