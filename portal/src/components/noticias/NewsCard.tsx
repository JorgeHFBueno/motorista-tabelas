import { ExternalLink, ImageOff } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NEWS_CATEGORY_LABELS, type NoticiaDoc } from "@/types/noticias";

const formatDate = (value: NoticiaDoc["publicadoEm"]) => {
  if (!value) return "Data indisponível";
  try {
    return value.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "Data indisponível";
  }
};

export const NewsCard = ({ noticia }: { noticia: NoticiaDoc }) => {
  const imageUrl = noticia.imagemUrl?.trim();
  const [imageError, setImageError] = useState(false);
  const showImage = Boolean(imageUrl) && !imageError;

  return (
    <Card className="overflow-hidden">
      <div className="h-40 bg-muted flex items-center justify-center">
        {showImage ? (
          <img
            src={imageUrl ?? ""}
            alt={noticia.titulo}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <ImageOff className="w-4 h-4" /> Sem imagem
          </div>
        )}
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">{NEWS_CATEGORY_LABELS[noticia.categoria]}</Badge>
          <Badge variant="outline" className="capitalize">{noticia.origem}</Badge>
        </div>
        <h3 className="font-semibold text-sm leading-snug">{noticia.titulo}</h3>
        <p className="text-sm text-muted-foreground line-clamp-3">{noticia.resumo}</p>
        <div className="text-xs text-muted-foreground flex justify-between gap-2">
          <span>{noticia.fonte}</span>
          <span>{formatDate(noticia.publicadoEm)}</span>
        </div>
        {noticia.url && (
          <a
            href={noticia.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm inline-flex items-center gap-1 text-primary font-medium"
          >
            Ler mais <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
};