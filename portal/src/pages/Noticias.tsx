import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { NewsSection } from "@/components/noticias/NewsSection";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicNoticias } from "@/hooks/useNoticias";
import { NEWS_CATEGORY_LABELS, NOTICIAS_CATEGORIAS } from "@/types/noticias";

const Noticias = () => {
  const { data, isLoading, isError } = usePublicNoticias();

  return (
    <ResponsiveLayout headerTitle="Notícias" headerSubtitle="Mercado, economia e inteligência estratégica">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-72 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Não foi possível carregar notícias neste momento. Tente novamente em instantes.
          </div>
        )}

        {!isLoading && !isError && NOTICIAS_CATEGORIAS.map((categoria) => (
          <NewsSection
            key={categoria}
            title={NEWS_CATEGORY_LABELS[categoria]}
            items={data[categoria] ?? []}
          />
        ))}
      </div>
    </ResponsiveLayout>
  );
};

export default Noticias;
