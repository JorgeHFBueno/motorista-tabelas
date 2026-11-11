import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, FileText, Filter, Loader2, Search } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveObraId } from "@/hooks/useActiveObraId";
import { useToast } from "@/hooks/use-toast";
import {
  DOCUMENTO_CATEGORIAS,
  categoriaLabel,
  useDocumentosList,
  type Documento,
  type DocumentoCategoria,
} from "@/lib/documentos/documentos";
import { abrirArquivo } from "@/lib/portal";

const formatDate = (documento: Documento) =>
  documento.criadoEm ? documento.criadoEm.toDate().toLocaleDateString("pt-BR") : "—";

const formatBytes = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const Documentos = () => {
  const { activeObraId } = useActiveObraId();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<DocumentoCategoria | null>(null);
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const { data = [], isLoading, isError } = useDocumentosList(activeObraId);

  const documentos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return data.filter(
      (documento) =>
        (!categoria || documento.categoria === categoria) &&
        (!termo || documento.titulo.toLowerCase().includes(termo)),
    );
  }, [busca, categoria, data]);

  // The download link is asked when the client opens the file (Storage Rules check the access).
  const abrir = async (documento: Documento) => {
    setAbrindoId(documento.id);
    const aberto = await abrirArquivo(documento.arquivo);
    setAbrindoId(null);
    if (!aberto) {
      toast({ title: "Arquivo indisponível", description: "Não foi possível abrir este documento agora.", variant: "destructive" });
    }
  };

  return (
    <ResponsiveLayout headerTitle="Documentos" headerSubtitle="Arquivo institucional e contratos">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar documento..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            className="pl-10 bg-white border-border/50"
          />
        </motion.div>

        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {[{ id: null, label: "Todos" }, ...DOCUMENTO_CATEGORIAS].map((item) => (
            <button
              key={item.label}
              onClick={() => setCategoria(item.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                categoria === item.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">
              {documentos.length} documento{documentos.length !== 1 ? "s" : ""}
            </h2>
            <Filter className="w-4 h-4 text-muted-foreground" />
          </div>

          {isLoading &&
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="card-institutional p-4 animate-pulse">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="mt-2 h-3 w-1/3 rounded bg-muted" />
              </div>
            ))}

          {isError && (
            <div className="card-institutional p-4 text-sm text-muted-foreground">
              Não foi possível carregar os documentos agora. Tente novamente em instantes.
            </div>
          )}

          {!isLoading && !isError && documentos.length === 0 && (
            <div className="card-institutional p-4 text-sm text-muted-foreground">Nenhum documento encontrado.</div>
          )}

          {documentos.map((documento, index) => (
            <motion.div
              key={documento.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              className="card-institutional p-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg shrink-0 bg-primary/10">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground text-sm truncate">{documento.titulo}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{categoriaLabel(documento.categoria)}</span>
                    <span>•</span>
                    <span>{formatDate(documento)}</span>
                    {documento.arquivo?.bytes ? (
                      <>
                        <span>•</span>
                        <span>{formatBytes(documento.arquivo.bytes)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  disabled={!documento.arquivo || abrindoId === documento.id}
                  onClick={() => void abrir(documento)}
                >
                  {abrindoId === documento.id ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Abrir documento
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </ResponsiveLayout>
  );
};

export default Documentos;
