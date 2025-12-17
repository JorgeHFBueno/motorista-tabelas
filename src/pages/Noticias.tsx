import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { motion } from "framer-motion";
import { Calendar, TrendingUp, Building, Truck, Lightbulb, Megaphone, ChevronRight } from "lucide-react";

const newsCategories = [
  { id: "economia", label: "Economia", icon: TrendingUp },
  { id: "infraestrutura", label: "Infraestrutura", icon: Building },
  { id: "logistica", label: "Logística", icon: Truck },
  { id: "inovacao", label: "Inovação", icon: Lightbulb },
  { id: "institucional", label: "Institucional", icon: Megaphone },
];

const newsItems = [
  {
    id: 1,
    category: "economia",
    title: "PIB do agronegócio cresce 8,5% e impulsiona investimentos em infraestrutura",
    subtitle: "Setor registra maior expansão em cinco anos, com reflexos diretos na demanda por construções industriais e galpões logísticos.",
    date: "16 Dez 2024",
    featured: true,
  },
  {
    id: 2,
    category: "infraestrutura",
    title: "Governo anuncia R$ 12 bilhões para rodovias no Sul do Brasil",
    subtitle: "Pacote de investimentos prevê melhorias em corredores estratégicos para escoamento de produção agrícola.",
    date: "15 Dez 2024",
    featured: false,
  },
  {
    id: 3,
    category: "inovacao",
    title: "Pré-fabricados de concreto reduzem tempo de obra em até 40%",
    subtitle: "Estudo técnico comprova eficiência de estruturas modulares em comparação com métodos tradicionais.",
    date: "14 Dez 2024",
    featured: false,
  },
  {
    id: 4,
    category: "logistica",
    title: "Demanda por galpões logísticos atinge recorde no terceiro trimestre",
    subtitle: "Expansão do e-commerce e nearshoring impulsionam construção de centros de distribuição.",
    date: "13 Dez 2024",
    featured: false,
  },
  {
    id: 5,
    category: "institucional",
    title: "Ledur Pré-Fabricados completa 30 anos de atuação no mercado",
    subtitle: "Empresa celebra marco com portfólio de mais de 2.000 obras entregues em todo o Brasil.",
    date: "12 Dez 2024",
    featured: false,
  },
];

const Noticias = () => {
  const featuredNews = newsItems.find(item => item.featured);
  const regularNews = newsItems.filter(item => !item.featured);

  const handleNewsClick = (newsId: number, category: string) => {
    console.log("news_click", { newsId, category, timestamp: new Date().toISOString() });
  };

  const handleCategoryClick = (categoryId: string) => {
    console.log("news_category_interest", { category: categoryId, timestamp: new Date().toISOString() });
  };

  return (
    <ResponsiveLayout headerTitle="Notícias" headerSubtitle="Mercado, economia e inteligência estratégica">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        {/* Categories */}
        <div className="flex gap-2 lg:gap-3 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide lg:flex-wrap">
          {newsCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => handleCategoryClick(category.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 lg:px-4 lg:py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors"
            >
              <category.icon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              {category.label}
            </button>
          ))}
        </div>

        {/* Featured News - Desktop Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Featured News */}
          {featuredNews && (
            <motion.article
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => handleNewsClick(featuredNews.id, featuredNews.category)}
              className="lg:col-span-2 card-institutional p-4 lg:p-6 cursor-pointer hover:shadow-card transition-shadow"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs font-medium rounded">
                  Destaque
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {featuredNews.date}
                </span>
              </div>
              <h2 className="text-base lg:text-xl font-semibold text-primary leading-snug mb-2">
                {featuredNews.title}
              </h2>
              <p className="text-sm lg:text-base text-muted-foreground leading-relaxed">
                {featuredNews.subtitle}
              </p>
              <div className="flex items-center gap-1 mt-3 text-secondary text-sm font-medium">
                Ler mais
                <ChevronRight className="w-4 h-4" />
              </div>
            </motion.article>
          )}

          {/* First Regular News on Desktop */}
          {regularNews[0] && (
            <motion.article
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              onClick={() => handleNewsClick(regularNews[0].id, regularNews[0].category)}
              className="hidden lg:block card-institutional p-4 lg:p-5 cursor-pointer hover:shadow-card transition-shadow"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground capitalize">
                  {newsCategories.find(c => c.id === regularNews[0].category)?.label}
                </span>
                <span className="text-muted-foreground/30">•</span>
                <span className="text-xs text-muted-foreground">
                  {regularNews[0].date}
                </span>
              </div>
              <h3 className="text-sm lg:text-base font-medium text-primary leading-snug mb-1">
                {regularNews[0].title}
              </h3>
              <p className="text-xs lg:text-sm text-muted-foreground line-clamp-3">
                {regularNews[0].subtitle}
              </p>
            </motion.article>
          )}
        </div>

        {/* News List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {regularNews.slice(window.innerWidth >= 1024 ? 1 : 0).map((news, index) => (
            <motion.article
              key={news.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleNewsClick(news.id, news.category)}
              className="card-institutional p-4 cursor-pointer hover:shadow-card transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground capitalize">
                      {newsCategories.find(c => c.id === news.category)?.label}
                    </span>
                    <span className="text-muted-foreground/30">•</span>
                    <span className="text-xs text-muted-foreground">
                      {news.date}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-primary leading-snug mb-1">
                    {news.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {news.subtitle}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-1" />
              </div>
            </motion.article>
          ))}
        </div>

        {/* Institutional Footer */}
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Conteúdo curado pela equipe de inteligência de mercado Ledur
          </p>
        </div>
      </div>
    </ResponsiveLayout>
  );
};

export default Noticias;
