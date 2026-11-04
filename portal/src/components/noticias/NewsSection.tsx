import { NewsCard } from "@/components/noticias/NewsCard";
import type { NoticiaDoc } from "@/types/noticias";

export const NewsSection = ({
  title,
  items,
}: {
  title: string;
  items: NoticiaDoc[];
}) => (
  <section className="space-y-3">
    <h2 className="text-lg font-semibold">{title}</h2>
    {items.length === 0 ? (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Nenhuma notícia publicada nesta categoria.
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <NewsCard key={item.id} noticia={item} />
        ))}
      </div>
    )}
  </section>
);