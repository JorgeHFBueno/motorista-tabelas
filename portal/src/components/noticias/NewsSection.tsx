import { NewsCard } from "@/components/noticias/NewsCard";
import { COR_CATEGORIA, idDaCategoria } from "@/components/noticias/categorias";
import { cn } from "@/lib/utils";
import { NEWS_CATEGORY_LABELS, type NoticiaCategoria, type NoticiaDoc } from "@/types/noticias";

export const NewsSection = ({ categoria, items }: { categoria: NoticiaCategoria; items: NoticiaDoc[] }) => (
  // scroll-mt leaves room for the sticky category bar when a chip scrolls here.
  <section id={idDaCategoria(categoria)} className="scroll-mt-20 space-y-3">
    <h2 className={cn("inline-flex rounded-lg px-3 py-1 text-base font-semibold", COR_CATEGORIA[categoria])}>
      {NEWS_CATEGORY_LABELS[categoria]}
    </h2>
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
