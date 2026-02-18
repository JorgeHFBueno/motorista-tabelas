import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Camera, Calendar, Layers, X, ZoomIn } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Badge } from "@/components/ui/badge";
import { useActiveObraId } from "@/hooks/useActiveObraId";
import { useFotos } from "@/hooks/useAppQueries";

interface Photo {
  id: string;
  url: string;
  stage: string;
  date: string;
  month: string;
  year: string;
  observation?: string;
}

const photos: Photo[] = [
  { id: "1", url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=300&fit=crop", stage: "Fundação", date: "15/03/2024", month: "Março", year: "2024", observation: "Início da concretagem da fundação" },
  { id: "2", url: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=400&h=300&fit=crop", stage: "Fundação", date: "22/03/2024", month: "Março", year: "2024", observation: "Cura do concreto finalizada" },
  { id: "3", url: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&h=300&fit=crop", stage: "Estrutura", date: "10/04/2024", month: "Abril", year: "2024", observation: "Montagem dos pilares pré-fabricados" },
  { id: "4", url: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=400&h=300&fit=crop", stage: "Estrutura", date: "25/04/2024", month: "Abril", year: "2024", observation: "Instalação das vigas principais" },
  { id: "5", url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=300&fit=crop", stage: "Estrutura", date: "08/05/2024", month: "Maio", year: "2024", observation: "Estrutura metálica completa" },
  { id: "6", url: "https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?w=400&h=300&fit=crop", stage: "Cobertura", date: "20/05/2024", month: "Maio", year: "2024", observation: "Início da instalação das telhas" },
  { id: "7", url: "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=400&h=300&fit=crop", stage: "Cobertura", date: "05/06/2024", month: "Junho", year: "2024", observation: "Cobertura finalizada" },
  { id: "8", url: "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=400&h=300&fit=crop", stage: "Fechamento", date: "18/06/2024", month: "Junho", year: "2024", observation: "Painéis laterais em instalação" },
];

const stages = ["Todas", "Fundação", "Estrutura", "Cobertura", "Fechamento"];

const Fotos = () => {
  const { activeObraId, hasClientObra } = useActiveObraId();
  const { data: fotosData = [], isLoading } = useFotos(activeObraId ?? undefined);
  const [selectedStage, setSelectedStage] = useState("Todas");
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [viewStartTime, setViewStartTime] = useState<number | null>(null);

  useEffect(() => {
    console.log("Event: photos_view");
    setViewStartTime(Date.now());

    return () => {
      if (viewStartTime) {
        const timeSpent = Math.round((Date.now() - viewStartTime) / 1000);
        console.log("Event: time_spent_photos", { seconds: timeSpent });
      }
    };
  }, []);

  const filteredPhotos = photos.filter((photo) => {
    return selectedStage === "Todas" || photo.stage === selectedStage;
  });

  const groupedByMonth = filteredPhotos.reduce((acc, photo) => {
    const key = `${photo.month} ${photo.year}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(photo);
    return acc;
  }, {} as Record<string, Photo[]>);

  const handlePhotoOpen = (photo: Photo) => {
    setSelectedPhoto(photo);
    console.log("Event: photo_open", { photo_id: photo.id, stage: photo.stage });
  };

  const handleStageFilter = (stage: string) => {
    setSelectedStage(stage);
    console.log("Event: photo_stage_view", { stage });
  };

  return (
    <ResponsiveLayout headerTitle="Fotos" headerSubtitle="Registro visual da evolução da obra">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        {!hasClientObra ? "Sem obra vinculada." : isLoading ? "Carregando fotos da obra..." : `Fotos carregadas: ${fotosData.length}`}
      </div>
        {/* Summary Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3 lg:gap-4"
        >
          <div className="card-institutional p-3 lg:p-4 text-center">
            <p className="text-2xl lg:text-3xl font-bold text-primary">{photos.length}</p>
            <p className="text-xs lg:text-sm text-muted-foreground">Total</p>
          </div>
          <div className="card-institutional p-3 lg:p-4 text-center">
            <p className="text-2xl lg:text-3xl font-bold text-secondary">{stages.length - 1}</p>
            <p className="text-xs lg:text-sm text-muted-foreground">Etapas</p>
          </div>
          <div className="card-institutional p-3 lg:p-4 text-center">
            <p className="text-2xl lg:text-3xl font-bold text-foreground">{Object.keys(groupedByMonth).length}</p>
            <p className="text-xs lg:text-sm text-muted-foreground">Meses</p>
          </div>
        </motion.div>

        {/* Stage Filter */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex gap-2 lg:gap-3 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide lg:flex-wrap"
        >
          {stages.map((stage) => (
            <button
              key={stage}
              onClick={() => handleStageFilter(stage)}
              className={`px-3 py-1.5 lg:px-4 lg:py-2 rounded-full text-xs lg:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                selectedStage === stage
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Layers className="w-3 h-3 lg:w-4 lg:h-4" />
              {stage}
            </button>
          ))}
        </motion.div>

        {/* Photos Grid by Month */}
        <div className="space-y-6 lg:space-y-8">
          {Object.entries(groupedByMonth).map(([monthYear, monthPhotos], groupIndex) => (
            <motion.div
              key={monthYear}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + groupIndex * 0.1 }}
            >
              <div className="flex items-center gap-2 mb-3 lg:mb-4">
                <Calendar className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
                <h2 className="text-sm lg:text-base font-semibold text-primary">{monthYear}</h2>
                <span className="text-xs lg:text-sm text-muted-foreground">({monthPhotos.length} fotos)</span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
                {monthPhotos.map((photo, index) => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.25 + index * 0.05 }}
                    onClick={() => handlePhotoOpen(photo)}
                    className="card-institutional overflow-hidden cursor-pointer group"
                  >
                    <div className="relative aspect-[4/3]">
                      <img
                        src={photo.url}
                        alt={`${photo.stage} - ${photo.date}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-6 h-6 lg:w-8 lg:h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="p-2.5 lg:p-3">
                      <Badge variant="outline" className="text-xs mb-1.5">
                        {photo.stage}
                      </Badge>
                      <p className="text-xs lg:text-sm text-muted-foreground">{photo.date}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="flex items-center justify-between p-4 lg:p-6">
            <div>
              <Badge variant="secondary" className="mb-1">{selectedPhoto.stage}</Badge>
              <p className="text-white/70 text-sm lg:text-base">{selectedPhoto.date}</p>
            </div>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </button>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
            <img
              src={selectedPhoto.url}
              alt={`${selectedPhoto.stage} - ${selectedPhoto.date}`}
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          
          {selectedPhoto.observation && (
            <div className="p-4 lg:p-6 bg-white/5">
              <p className="text-sm lg:text-base font-medium text-white mb-1">Observação Técnica</p>
              <p className="text-sm lg:text-base text-white/70">{selectedPhoto.observation}</p>
            </div>
          )}
        </motion.div>
      )}
    </ResponsiveLayout>
  );
};

export default Fotos;
