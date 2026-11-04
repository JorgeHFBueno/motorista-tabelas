import { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";

type CategoriaFiltro = "Todas" | "Contratos" | "Aditivos" | "Projetos" | "ART/RRT" | "Licenças" | "Notas Fiscais" | "Relatórios" | "Fundação" | "Estrutura" | "Cobertura" | "Fechamento";

interface DocumentoV2 extends DocumentData {
  id: string;
  titulo?: string;
  categoria?: string | null;
  obraId?: string | null;
  fileName?: string;
  filePath?: string;
  sizeBytes?: number;
  createdAt?: unknown;
}

const CATEGORIAS: CategoriaFiltro[] = [
  "Todas",
  "Contratos",
  "Aditivos",
  "Projetos",
  "ART/RRT",
  "Licenças",
  "Notas Fiscais",
  "Relatórios",
  "Fundação",
  "Estrutura",
  "Cobertura",
  "Fechamento",
];

const formatTimestamp = (value: unknown) => {
  if (value instanceof Timestamp) {
    return value.toDate().toLocaleString("pt-BR");
  }

  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toLocaleString("pt-BR");
  }

  return "—";
};

const DocumentosV2 = () => {
  const { user, userDoc } = useAuth();

  const [obraIdInput, setObraIdInput] = useState("");
  const [categoria, setCategoria] = useState<CategoriaFiltro>("Todas");
  const [tituloBusca, setTituloBusca] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentoV2[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentoV2 | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitulo, setUploadTitulo] = useState("");
  const [uploadCategoria, setUploadCategoria] = useState<CategoriaFiltro>("Contratos");
  const [uploadVincularObra, setUploadVincularObra] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const filtroEfetivo = useMemo(
    () => ({
      obraId: obraIdInput.trim() || null,
      categoria: categoria === "Todas" ? null : categoria,
      tituloBusca: tituloBusca.trim() || null,
    }),
    [obraIdInput, categoria, tituloBusca],
  );

  const loadDocs = async () => {
    if (!db) {
      setError("Firestore indisponível.");
      return;
    }

    setLoading(true);
    setError(null);

    const obraId = obraIdInput.trim();
    const constraints: QueryConstraint[] = [];

    if (obraId) {
      constraints.push(where("obraId", "==", obraId));
    }

    if (categoria !== "Todas") {
      constraints.push(where("categoria", "==", categoria));
    }

    constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(50));

    console.info("[docs-v2] user context", {
      uid: user?.uid ?? null,
      role: userDoc?.role ?? null,
      userObrasCount: userDoc?.obras?.length ?? 0,
      userObras: userDoc?.obras ?? [],
    });

    console.info("[docs-v2] load start", {
      obraIdFinal: obraId || null,
      queryConstraints: constraints.map((constraint) => String((constraint as unknown as { type?: string }).type ?? "constraint")),
      filtroEfetivo,
    });

    try {
      const docsRef = collection(db, "documentos");
      const docsQuery = query(docsRef, ...constraints);
      const snapshot = await getDocs(docsQuery);
      const docsRaw: DocumentoV2[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as DocumentData;
        return {
          id: docSnap.id,
          ...data,
        };
      });

      const titulo = tituloBusca.trim().toLowerCase();
      const docsFiltrados = titulo
        ? docsRaw.filter((docItem) => String(docItem.titulo ?? "").toLowerCase().includes(titulo))
        : docsRaw;

      console.info("[docs-v2] load success", {
        totalAntesFiltroMemoria: docsRaw.length,
        totalDepoisFiltroMemoria: docsFiltrados.length,
      });

      setDocs(docsFiltrados);
      setSelectedDoc(null);
    } catch (err) {
      const firestoreError = err as { code?: string; message?: string };
      const message = firestoreError?.message ?? "Erro ao carregar documentos.";
      console.info("[docs-v2] load error", {
        code: firestoreError?.code ?? "unknown",
        message,
        rawError: err,
      });
      setError(`${firestoreError?.code ?? "erro"}: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const limpar = () => {
    setObraIdInput("");
    setCategoria("Todas");
    setTituloBusca("");
    setError(null);
    setDocs([]);
    setSelectedDoc(null);
    console.info("[docs-v2] filtros limpos");
  };

  const usarObraUserDoc = () => {
    const primeiraObra = userDoc?.obras?.[0] ?? "";
    setObraIdInput(primeiraObra);
    console.info("[docs-v2] usar obra do userDoc", { obraId: primeiraObra || null });
  };

  const copyDocId = async () => {
    if (!selectedDoc?.id) return;

    await navigator.clipboard.writeText(selectedDoc.id);
    console.info("[docs-v2] docId copiado", { docId: selectedDoc.id });
  };

  const baixarArquivo = async () => {
    if (!storage || !selectedDoc?.filePath) return;

    try {
      const downloadUrl = await getDownloadURL(ref(storage, selectedDoc.filePath as string));
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      console.info("[docs-v2] download gerado", { filePath: selectedDoc.filePath });
    } catch (err) {
      const storageError = err as { code?: string; message?: string };
      console.info("[docs-v2] download error", {
        code: storageError?.code ?? "unknown",
        message: storageError?.message ?? "unknown",
      });
      setError(`${storageError?.code ?? "erro"}: ${storageError?.message ?? "Erro ao baixar arquivo."}`);
    }
  };

  const uploadRapido = async () => {
    if (!db || !storage) {
      setUploadError("Firebase indisponível.");
      return;
    }

    if (!uploadFile) {
      setUploadError("Selecione um arquivo.");
      return;
    }

    const isValidType = uploadFile.type === "application/pdf" || uploadFile.type.startsWith("image/");
    if (!isValidType) {
      setUploadError("Apenas PDF e imagens são aceitos.");
      return;
    }

    setUploadLoading(true);
    setUploadError(null);

    const obraIdFinal = uploadVincularObra ? obraIdInput.trim() || null : null;

    try {
      let obraNomeSnapshot: string | null = null;

      if (obraIdFinal) {
        const obraSnap = await getDoc(doc(collection(db, "obras"), obraIdFinal));
        if (obraSnap.exists()) {
          obraNomeSnapshot = String(obraSnap.data()?.nome ?? "").trim() || null;
        }
      }

      const tituloFinal = uploadTitulo.trim() || uploadFile.name;
      const docRef = await addDoc(collection(db, "documentos"), {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        titulo: tituloFinal,
        categoria: uploadCategoria,
        obraId: obraIdFinal,
        obraNomeSnapshot,
        fileName: uploadFile.name,
        contentType: uploadFile.type || null,
        sizeBytes: uploadFile.size,
        filePath: "",
        status: "ATIVO",
      });

      const safeObraId = obraIdFinal || "geral";
      const filePath = `documentos/${safeObraId}/${docRef.id}/${uploadFile.name}`;

      await uploadBytes(ref(storage, filePath), uploadFile, {
        contentType: uploadFile.type,
      });

      await updateDoc(docRef, {
        filePath,
        updatedAt: serverTimestamp(),
      });

      console.info("[docs-v2] upload sucesso", {
        docId: docRef.id,
        obraIdFinal,
        filePath,
      });

      await loadDocs();
      setUploadFile(null);
      setUploadTitulo("");
    } catch (err) {
      const firestoreError = err as { code?: string; message?: string };
      console.info("[docs-v2] upload error", {
        code: firestoreError?.code ?? "unknown",
        message: firestoreError?.message ?? "unknown",
        rawError: err,
      });
      setUploadError(`${firestoreError?.code ?? "erro"}: ${firestoreError?.message ?? "Erro no upload."}`);
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <ResponsiveLayout headerTitle="Documentos v2" headerSubtitle="Diagnóstico simples de listagem/busca/upload">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold">Filtros</h2>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm">Obra ID</label>
              <input className="w-full rounded border px-3 py-2" value={obraIdInput} onChange={(e) => setObraIdInput(e.target.value)} />
            </div>

            <div className="flex items-end">
              <button className="rounded border px-3 py-2" onClick={usarObraUserDoc}>Usar obra do userDoc</button>
            </div>

            <div className="space-y-1">
              <label className="text-sm">Categoria</label>
              <select className="w-full rounded border px-3 py-2" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaFiltro)}>
                {CATEGORIAS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm">Buscar por título contém</label>
              <input className="w-full rounded border px-3 py-2" value={tituloBusca} onChange={(e) => setTituloBusca(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2">
            <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={loadDocs} disabled={loading}>
              {loading ? "Carregando..." : "Carregar"}
            </button>
            <button className="rounded border px-4 py-2" onClick={limpar}>Limpar</button>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-2">
          <p>Retornados: {docs.length}</p>
          <pre className="rounded bg-muted p-2 text-xs">Filtro efetivo: {JSON.stringify(filtroEfetivo, null, 2)}</pre>
        </div>

        {error && <div className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-700">Erro: {error}</div>}

        {!loading && docs.length === 0 && !error && <div className="rounded border p-3">Nenhum documento encontrado.</div>}

        {loading && <div className="rounded border p-3">Carregando...</div>}

        {docs.length > 0 && (
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-muted text-left">
                  <th className="p-2">createdAt</th>
                  <th className="p-2">titulo</th>
                  <th className="p-2">categoria</th>
                  <th className="p-2">obraId</th>
                  <th className="p-2">fileName</th>
                  <th className="p-2">sizeBytes</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((item) => (
                  <tr key={item.id} className="cursor-pointer border-t hover:bg-muted/50" onClick={() => setSelectedDoc(item)}>
                    <td className="p-2">{formatTimestamp(item.createdAt)}</td>
                    <td className="p-2">{String(item.titulo ?? "—")}</td>
                    <td className="p-2">{String(item.categoria ?? "—")}</td>
                    <td className="p-2">{String(item.obraId ?? "—")}</td>
                    <td className="p-2">{String(item.fileName ?? "—")}</td>
                    <td className="p-2">{typeof item.sizeBytes === "number" ? item.sizeBytes : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedDoc && (
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold">Detalhe</h3>
            <div className="flex gap-2">
              <button className="rounded border px-3 py-2" onClick={copyDocId}>Copiar docId</button>
              <button className="rounded border px-3 py-2" onClick={baixarArquivo}>Baixar</button>
            </div>
            <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(selectedDoc, null, 2)}</pre>
          </div>
        )}

        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold">Upload rápido (teste)</h2>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm">Arquivo (PDF/imagem)</label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setUploadFile(file);
                  if (file && !uploadTitulo.trim()) {
                    setUploadTitulo(file.name);
                  }
                }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm">Título</label>
              <input className="w-full rounded border px-3 py-2" value={uploadTitulo} onChange={(e) => setUploadTitulo(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-sm">Categoria</label>
              <select className="w-full rounded border px-3 py-2" value={uploadCategoria} onChange={(e) => setUploadCategoria(e.target.value as CategoriaFiltro)}>
                {CATEGORIAS.filter((item) => item !== "Todas").map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={uploadVincularObra} onChange={(e) => setUploadVincularObra(e.target.checked)} />
              vincular à obraId atual
            </label>
          </div>

          <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={uploadRapido} disabled={uploadLoading}>
            {uploadLoading ? "Enviando..." : "Enviar"}
          </button>

          {uploadError && <div className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-700">Erro upload: {uploadError}</div>}
        </div>
      </div>
    </ResponsiveLayout>
  );
};

export default DocumentosV2;