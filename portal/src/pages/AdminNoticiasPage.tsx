import { useMemo, useState } from "react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAdminInstitutionalNoticias,
  useCreateInstitutionalNoticia,
  useDeleteInstitutionalNoticia,
  useRefreshExternalNoticias,
  useUpdateInstitutionalNoticia,
  useUploadInstitutionalImage,
} from "@/hooks/useNoticias";
import { toast } from "@/hooks/use-toast";
import type { ExternalNewsRefreshResponse } from "@/lib/functions";
import type { NoticiaCreateInput, NoticiaDoc, NoticiaStatus } from "@/types/noticias";

const toDateInputValue = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const buildRefreshSummary = (result: ExternalNewsRefreshResponse) => {
  const executedAt = new Date(result.executedAt).toLocaleString("pt-BR");
  const categories = result.affectedCategories.length > 0 ? result.affectedCategories.join(", ") : "nenhuma";

  return [
    `Buscadas: ${result.totals.fetched}`,
    `Aproveitadas: ${result.totals.curated}`,
    `Descartadas: ${result.totals.discarded}`,
    `Fontes: ${result.totals.contributingSources}`,
    `Categorias afetadas: ${categories}`,
    `Atualizado em: ${executedAt}`,
  ].join(" | ");
};

const buildRefreshDetails = (result: ExternalNewsRefreshResponse) =>
  Object.entries(result.categories)
    .map(([category, summary]) => (
      `${category}: ${summary.curated} aproveitadas, ${summary.discarded} descartadas, ${summary.contributingSources} fontes`
    ))
    .join("\n");

const AdminNoticiasPage = () => {
  const { user } = useAuth();
  const { data = [], isLoading } = useAdminInstitutionalNoticias();
  const createMutation = useCreateInstitutionalNoticia();
  const updateMutation = useUpdateInstitutionalNoticia();
  const deleteMutation = useDeleteInstitutionalNoticia();
  const uploadMutation = useUploadInstitutionalImage();
  const refreshExternalMutation = useRefreshExternalNoticias();

  const [editing, setEditing] = useState<NoticiaDoc | null>(null);
  const [titulo, setTitulo] = useState("");
  const [resumo, setResumo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [url, setUrl] = useState("");
  const [imagemUrl, setImagemUrl] = useState("");
  const [status, setStatus] = useState<NoticiaStatus>("rascunho");
  const [tags, setTags] = useState("");
  const [destaque, setDestaque] = useState(false);
  const [publicadoEm, setPublicadoEm] = useState(toDateInputValue());

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || uploadMutation.isPending;
  const refreshSummary = refreshExternalMutation.data ? buildRefreshSummary(refreshExternalMutation.data) : null;
  const refreshDetails = refreshExternalMutation.data ? buildRefreshDetails(refreshExternalMutation.data) : null;

  const userPayload = useMemo(
    () => ({uid: user?.uid ?? "", nome: user?.displayName ?? undefined, email: user?.email ?? undefined}),
    [user],
  );

  const resetForm = () => {
    setEditing(null);
    setTitulo("");
    setResumo("");
    setConteudo("");
    setUrl("");
    setImagemUrl("");
    setStatus("rascunho");
    setTags("");
    setDestaque(false);
    setPublicadoEm(toDateInputValue());
  };

  const fromDocToForm = (item: NoticiaDoc) => {
    setEditing(item);
    setTitulo(item.titulo);
    setResumo(item.resumo);
    setConteudo(item.conteudo ?? "");
    setUrl(item.url ?? "");
    setImagemUrl(item.imagemUrl ?? "");
    setStatus(item.status);
    setTags(item.tags.join(", "));
    setDestaque(item.destaque);
    setPublicadoEm(toDateInputValue(item.publicadoEm.toDate()));
  };

  const buildInput = (): NoticiaCreateInput => ({
    titulo,
    resumo,
    conteudo,
    url,
    imagemUrl,
    status,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    destaque,
    publicadoEm: new Date(publicadoEm),
  });

  const onSubmit = async () => {
    if (!userPayload.uid) return;
    try {
      if (editing) {
        await updateMutation.mutateAsync({id: editing.id, input: buildInput(), user: userPayload});
        toast({title: "Noticia atualizada", description: "A noticia institucional foi atualizada."});
      } else {
        await createMutation.mutateAsync({input: buildInput(), user: userPayload});
        toast({title: "Noticia criada", description: "A noticia institucional foi criada."});
      }
      resetForm();
    } catch (error) {
      toast({title: "Erro", description: "Nao foi possivel salvar a noticia.", variant: "destructive"});
    }
  };

  const onRefreshExternalNews = async () => {
    try {
      const result = await refreshExternalMutation.mutateAsync();
      toast({
        title: "Noticias externas atualizadas",
        description: buildRefreshSummary(result),
      });
    } catch (error) {
      toast({
        title: "Erro na atualizacao",
        description: "Nao foi possivel executar a ingestao externa agora.",
        variant: "destructive",
      });
    }
  };

  return (
    <ResponsiveLayout headerTitle="Noticias institucionais" headerSubtitle="Gerencie os conteudos institucionais e dispare a ingestao externa">
      <div className="px-4 py-6 lg:px-8 lg:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{editing ? "Editar noticia" : "Nova noticia"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="space-y-1">
                <Label>Atualizacao externa</Label>
                <p className="text-sm text-muted-foreground">
                  Usa a mesma pipeline do scheduler de 12h para economia, infraestrutura, logistica e inovacao.
                </p>
              </div>
              <Button
                className="w-full"
                disabled={refreshExternalMutation.isPending}
                onClick={() => void onRefreshExternalNews()}
              >
                {refreshExternalMutation.isPending ? "Atualizando noticias externas..." : "Atualizar noticias externas agora"}
              </Button>
              {refreshSummary && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{refreshSummary}</p>
                  {refreshDetails && (
                    <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground font-sans">{refreshDetails}</pre>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1"><Label>Titulo</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
            <div className="space-y-1"><Label>Resumo</Label><Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} /></div>
            <div className="space-y-1"><Label>Conteudo (opcional)</Label><Textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} /></div>
            <div className="space-y-1"><Label>URL (opcional)</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} /></div>
            <div className="space-y-1"><Label>Imagem URL (opcional)</Label><Input value={imagemUrl} onChange={(e) => setImagemUrl(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Upload de imagem (opcional)</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !user?.uid) return;
                  try {
                    const uploadedUrl = await uploadMutation.mutateAsync({uid: user.uid, file});
                    setImagemUrl(uploadedUrl);
                  } catch (error) {
                    toast({title: "Erro no upload", description: "Nao foi possivel enviar a imagem.", variant: "destructive"});
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value: NoticiaStatus) => setStatus(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="publicada">Publicada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Tags (separadas por virgula)</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} /></div>
            <div className="space-y-1"><Label>Data de publicacao</Label><Input type="datetime-local" value={publicadoEm} onChange={(e) => setPublicadoEm(e.target.value)} /></div>
            <div className="flex items-center justify-between"><Label>Destaque</Label><Switch checked={destaque} onCheckedChange={setDestaque} /></div>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => void onSubmit()}>{editing ? "Salvar" : "Criar"}</Button>
              {editing && <Button variant="outline" onClick={resetForm}>Cancelar</Button>}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Noticias institucionais</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {data.map((item) => (
              <div key={item.id} className="rounded-lg border p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{item.titulo}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.resumo}</p>
                  <p className="text-xs text-muted-foreground mt-1">Status: {item.status} • {item.publicadoEm.toDate().toLocaleString("pt-BR")}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fromDocToForm(item)}>Editar</Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={async () => {
                      try {
                        await deleteMutation.mutateAsync(item.id);
                        toast({title: "Noticia excluida"});
                        if (editing?.id === item.id) resetForm();
                      } catch (error) {
                        toast({title: "Erro", description: "Nao foi possivel excluir a noticia.", variant: "destructive"});
                      }
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ResponsiveLayout>
  );
};

export default AdminNoticiasPage;
