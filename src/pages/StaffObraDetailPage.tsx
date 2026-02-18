import { useEffect } from "react";
import { useParams } from "react-router-dom";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentos, useFotos, useObra } from "@/hooks/useAppQueries";
import { useObra as useObraContext } from "@/contexts/ObraContext";

const StaffObraDetailPage = () => {
  const { obraId } = useParams();
  const { data: obra } = useObra(obraId);
  const { data: documentos = [], isLoading: isLoadingDocs } = useDocumentos(obraId);
  const { data: fotos = [], isLoading: isLoadingFotos } = useFotos(obraId);
  const { setObraAtivaId } = useObraContext();

  useEffect(() => {
    if (obraId) {
      setObraAtivaId(obraId);
    }
  }, [obraId, setObraAtivaId]);

  return (
    <ResponsiveLayout headerTitle={obra?.nome ?? "Detalhe da obra"} headerSubtitle="Documentos e fotos por obra">
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <Tabs defaultValue="documentos" className="space-y-4">
          <TabsList>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="fotos">Fotos</TabsTrigger>
          </TabsList>
          <TabsContent value="documentos" className="rounded-xl border p-4">
            {isLoadingDocs ? "Carregando documentos..." : `Total documentos: ${documentos.length}`}
          </TabsContent>
          <TabsContent value="fotos" className="rounded-xl border p-4">
            {isLoadingFotos ? "Carregando fotos..." : `Total fotos: ${fotos.length}`}
          </TabsContent>
        </Tabs>
      </div>
    </ResponsiveLayout>
  );
};

export default StaffObraDetailPage;