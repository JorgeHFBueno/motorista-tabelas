import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import {
  MAX_ANEXOS, MAX_TEXTO_OBSERVACAO, excluirObservacao, publicarObservacao,
} from '../data/logisticaFirestore';
import type { AnexoObservacao, Observacao, RefPessoa } from '../domain/models';
import type { CadastrosLogistica } from './contexto';

const mensagem = (error: unknown) => (error instanceof Error ? error.message : String(error));
const eImagem = (tipo: string) => /^image\/(png|jpe?g|gif|webp|bmp)$/i.test(tipo);

function tamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function quando(ms: number | null) {
  if (ms === null) return 'agora';
  return new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Texto com os endereços como links. */
function TextoObservacao({ texto }: { texto: string }) {
  if (!texto.trim()) return null;
  return (
    <p className="lg-obs-texto">
      {texto.split(/(https?:\/\/[^\s]+)/g).map((parte, indice) => (/^https?:\/\//.test(parte)
        ? <a key={indice} href={parte} target="_blank" rel="noreferrer">{parte}</a>
        : <span key={indice}>{parte}</span>))}
    </p>
  );
}

function Anexos({ anexos }: { anexos: readonly AnexoObservacao[] }) {
  if (!anexos.length) return null;
  return (
    <div className="lg-obs-anexos">
      {anexos.map((anexo) => (eImagem(anexo.tipo) ? (
        <a key={anexo.caminho} className="lg-obs-imagem" href={anexo.url} target="_blank" rel="noreferrer" title={anexo.nome}>
          <img src={anexo.url} alt={anexo.nome} loading="lazy" />
        </a>
      ) : (
        <a key={anexo.caminho} className="lg-obs-arquivo" href={anexo.url} target="_blank" rel="noreferrer" title={anexo.nome}>
          <InsertDriveFileOutlined fontSize="small" /><span>{anexo.nome}</span><small>{tamanho(anexo.tamanho)}</small>
        </a>
      )))}
    </div>
  );
}

function Escrever({ programacaoId, eu }: { programacaoId: string; eu: RefPessoa }) {
  const seletor = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const adicionar = (lista: FileList | null) => {
    if (lista?.length) setArquivos((atuais) => [...atuais, ...Array.from(lista)].slice(0, MAX_ANEXOS));
  };
  const colar = (event: ClipboardEvent) => { if (event.clipboardData.files.length) { event.preventDefault(); adicionar(event.clipboardData.files); } };
  const soltar = (event: DragEvent) => { event.preventDefault(); setArrastando(false); adicionar(event.dataTransfer.files); };
  const vazio = !texto.trim() && !arquivos.length;

  const publicar = async () => {
    if (enviando || vazio) return;
    setErro(null);
    setEnviando(arquivos.length ? `Enviando 0 de ${arquivos.length}…` : 'Publicando…');
    try {
      await publicarObservacao(programacaoId, texto.trim(), arquivos, eu, (enviados) => setEnviando(`Enviando ${enviados} de ${arquivos.length}…`));
      setTexto('');
      setArquivos([]);
    } catch (error) {
      setErro(`Não foi possível publicar: ${mensagem(error)}`);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div
      className={`lg-obs-escrever${arrastando ? ' is-arrastando' : ''}`}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setArrastando(true); } }}
      onDragLeave={() => setArrastando(false)}
      onDrop={soltar}
    >
      <textarea
        rows={3}
        value={texto}
        maxLength={MAX_TEXTO_OBSERVACAO}
        placeholder="Escreva uma observação… cole ou arraste imagens aqui"
        aria-label="Nova observação"
        onChange={(event) => setTexto(event.target.value)}
        onPaste={colar}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) publicar(); }}
      />
      {arquivos.length > 0 && (
        <div className="lg-obs-pendentes">
          {arquivos.map((arquivo, indice) => (
            <span key={`${arquivo.name}-${indice}`} className="lg-obs-chip">
              <span>{arquivo.name}</span><small>{tamanho(arquivo.size)}</small>
              <button type="button" aria-label={`Remover ${arquivo.name}`} onClick={() => setArquivos((atuais) => atuais.filter((_, k) => k !== indice))}>
                <CloseRounded fontSize="inherit" />
              </button>
            </span>
          ))}
        </div>
      )}
      {erro && <p className="lg-obs-erro" role="alert">{erro}</p>}
      <div className="lg-obs-barra">
        <button type="button" className="lg-btn-icone" title="Anexar arquivos ou imagens" aria-label="Anexar arquivos" onClick={() => seletor.current?.click()} disabled={arquivos.length >= MAX_ANEXOS}>
          <AttachFileRounded fontSize="small" />
        </button>
        <input ref={seletor} type="file" multiple hidden onChange={(event) => { adicionar(event.target.files); event.target.value = ''; }} />
        <small className="lg-obs-dica">{enviando ?? (arrastando ? 'Solte os arquivos aqui' : 'Ctrl+Enter para publicar')}</small>
        <button type="button" className="lg-btn lg-btn-primario" onClick={publicar} disabled={!!enviando || vazio}>Publicar</button>
      </div>
    </div>
  );
}

/** Observações da programação, da mais nova para a mais antiga; só o autor exclui a sua. */
export function ObservacoesProgramacao({ programacaoId, observacoes, eu, cadastros }: {
  programacaoId: string;
  observacoes: readonly Observacao[];
  eu: RefPessoa;
  cadastros: CadastrosLogistica;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const excluir = (observacao: Observacao) => {
    if (!window.confirm('Excluir esta observação e os arquivos dela?')) return;
    setErro(null);
    excluirObservacao(observacao).catch((error) => setErro(`Não foi possível excluir: ${mensagem(error)}`));
  };
  return (
    <div className="lg-obs">
      <Escrever key={programacaoId} programacaoId={programacaoId} eu={eu} />
      {erro && <p className="lg-obs-erro" role="alert">{erro}</p>}
      {observacoes.length === 0 && (
        <div className="lg-obs-vazio">
          <ChatBubbleOutlineRounded />
          <p>Nenhuma observação ainda.</p>
          <small>Registre o andamento, combinações com a obra e fotos da carga.</small>
        </div>
      )}
      {observacoes.map((observacao) => (
        <article key={observacao.id} className="lg-obs-cartao">
          <header>
            <strong>{cadastros.nomePessoa(observacao.autor.uid, observacao.autor.nome)}</strong>
            <small>{quando(observacao.criadoEm)}</small>
            <span className="lg-espaco" />
            {observacao.autor.uid === eu.uid && (
              <button type="button" className="lg-btn-icone" title="Excluir" aria-label="Excluir observação" onClick={() => excluir(observacao)}>
                <DeleteOutlineRounded fontSize="small" />
              </button>
            )}
          </header>
          <TextoObservacao texto={observacao.texto} />
          <Anexos anexos={observacao.anexos} />
        </article>
      ))}
    </div>
  );
}
