import AlternateEmailRounded from '@mui/icons-material/AlternateEmailRounded';
import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import {
  MAX_ANEXOS, MAX_TEXTO_OBSERVACAO, editarObservacao, excluirObservacao, publicarObservacao,
} from '../data/logisticaFirestore';
import { buscaDaMarca, marcarTexto, paraEditar, partesDoTexto } from '../domain/mencoes';
import type { AnexoObservacao, Observacao, RefPessoa } from '../domain/models';
import type { CadastrosLogistica } from './contexto';

/** Quem pode ser marcado com @: ativo, com a área Logística ou adm2 (vê o cronograma). */
export interface PessoaMarcavel { uid: string; nome: string }

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

/** Texto com os endereços como links e as marcas @{uid} como @Nome destacado (o meu, mais forte). */
function TextoObservacao({ texto, eu, nome }: { texto: string; eu: string; nome: (uid: string) => string }) {
  if (!texto.trim()) return null;
  return (
    <p className="lg-obs-texto">
      {partesDoTexto(texto).map((parte, indice) => ('uid' in parte
        ? <span key={indice} className={`lg-mencao${parte.uid === eu ? ' is-eu' : ''}`}>@{nome(parte.uid)}</span>
        : parte.texto.split(/(https?:\/\/[^\s]+)/g).map((trecho, k) => (/^https?:\/\//.test(trecho)
          ? <a key={`${indice}-${k}`} href={trecho} target="_blank" rel="noreferrer">{trecho}</a>
          : <span key={`${indice}-${k}`}>{trecho}</span>))))}
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

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Edição: a observação do autor, o nome conhecido de cada marcado e o que fazer ao salvar ou cancelar. */
interface Edicao { observacao: Observacao; nome: (uid: string) => string | undefined; aoTerminar: () => void }

function Escrever({ programacaoId, eu, marcaveis, edicao }: { programacaoId: string; eu: RefPessoa; marcaveis: readonly PessoaMarcavel[]; edicao?: Edicao }) {
  const seletor = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  // Na edição, as marcas salvas voltam como "@Nome" e as pessoas ficam escolhidas (domain/mencoes.ts, paraEditar).
  const [inicial] = useState(() => (edicao ? paraEditar(edicao.observacao.texto, edicao.nome) : { texto: '', escolhidos: [] }));
  const [texto, setTexto] = useState(inicial.texto);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // @: quem foi escolhido na lista (vira @{uid} ao publicar) e o "@termo" sendo escrito.
  const [escolhidos, setEscolhidos] = useState<PessoaMarcavel[]>(inicial.escolhidos);
  const [busca, setBusca] = useState<{ termo: string; inicio: number } | null>(null);
  const [indice, setIndice] = useState(0);
  const candidatos = useMemo(() => (!busca ? [] : marcaveis
    .filter((pessoa) => pessoa.uid !== eu.uid && semAcento(pessoa.nome).includes(semAcento(busca.termo)))
    .slice(0, 8)), [busca, marcaveis, eu.uid]);

  const detectar = (valor: string, cursor: number) => { setBusca(buscaDaMarca(valor, cursor)); setIndice(0); };
  const escolher = (pessoa: PessoaMarcavel) => {
    if (!busca || !caixa.current) return;
    const cursor = caixa.current.selectionStart;
    setTexto(`${texto.slice(0, busca.inicio)}@${pessoa.nome} ${texto.slice(cursor)}`);
    setEscolhidos((atuais) => (atuais.some((p) => p.uid === pessoa.uid) ? atuais : [...atuais, pessoa]));
    setBusca(null);
    const posicao = busca.inicio + pessoa.nome.length + 2;
    requestAnimationFrame(() => { caixa.current?.focus(); caixa.current?.setSelectionRange(posicao, posicao); });
  };
  const marcar = () => {
    const el = caixa.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const prefixo = cursor > 0 && !/\s/.test(texto[cursor - 1]) ? ' @' : '@';
    const novo = texto.slice(0, cursor) + prefixo + texto.slice(cursor);
    setTexto(novo);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor + prefixo.length, cursor + prefixo.length); detectar(novo, cursor + prefixo.length); });
  };
  const teclas = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (busca && candidatos.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setIndice((i) => (i + 1) % candidatos.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setIndice((i) => (i - 1 + candidatos.length) % candidatos.length); return; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); escolher(candidatos[indice]); return; }
      if (event.key === 'Escape') { event.stopPropagation(); setBusca(null); return; }
    }
    if (event.key === 'Escape' && edicao) { event.stopPropagation(); edicao.aoTerminar(); return; }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) publicar();
  };

  const adicionar = (lista: FileList | null) => {
    if (edicao) return;
    if (lista?.length) setArquivos((atuais) => [...atuais, ...Array.from(lista)].slice(0, MAX_ANEXOS));
  };
  const colar = (event: ClipboardEvent) => { if (event.clipboardData.files.length) { event.preventDefault(); adicionar(event.clipboardData.files); } };
  const soltar = (event: DragEvent) => { event.preventDefault(); setArrastando(false); adicionar(event.dataTransfer.files); };
  const vazio = !texto.trim() && !arquivos.length && !edicao?.observacao.anexos.length;

  const publicar = async () => {
    if (enviando || vazio) return;
    setErro(null);
    if (edicao) {
      setEnviando('Salvando…');
      try {
        const final = marcarTexto(texto.trim(), escolhidos);
        await editarObservacao(edicao.observacao.id, final.texto, final.marcados);
        edicao.aoTerminar();
      } catch (error) {
        setErro(`Não foi possível salvar: ${mensagem(error)}`);
        setEnviando(null);
      }
      return;
    }
    setEnviando(arquivos.length ? `Enviando 0 de ${arquivos.length}…` : 'Publicando…');
    try {
      const final = marcarTexto(texto.trim(), escolhidos);
      await publicarObservacao(programacaoId, final.texto, arquivos, eu, (enviados) => setEnviando(`Enviando ${enviados} de ${arquivos.length}…`), final.marcados);
      setTexto('');
      setArquivos([]);
      setEscolhidos([]);
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
        ref={caixa}
        rows={3}
        value={texto}
        maxLength={MAX_TEXTO_OBSERVACAO}
        placeholder={edicao ? 'Texto da observação… use @ para marcar alguém' : 'Escreva uma observação… use @ para marcar alguém; cole ou arraste imagens aqui'}
        aria-label={edicao ? 'Editar observação' : 'Nova observação'}
        autoFocus={!!edicao}
        onChange={(event) => { setTexto(event.target.value); detectar(event.target.value, event.target.selectionStart); }}
        onClick={(event) => detectar(texto, event.currentTarget.selectionStart)}
        onBlur={() => setBusca(null)}
        onPaste={colar}
        onKeyDown={teclas}
      />
      {busca && candidatos.length > 0 && (
        <div className="lg-obs-mencoes" role="listbox" aria-label="Marcar pessoa">
          {candidatos.map((pessoa, i) => (
            <button
              key={pessoa.uid}
              type="button"
              role="option"
              aria-selected={i === indice}
              className={i === indice ? 'is-ativa' : ''}
              onMouseDown={(event) => { event.preventDefault(); escolher(pessoa); }}
            >
              {pessoa.nome}
            </button>
          ))}
        </div>
      )}
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
        {!edicao && (
          <button type="button" className="lg-btn-icone" title="Anexar arquivos ou imagens" aria-label="Anexar arquivos" onClick={() => seletor.current?.click()} disabled={arquivos.length >= MAX_ANEXOS}>
            <AttachFileRounded fontSize="small" />
          </button>
        )}
        <button type="button" className="lg-btn-icone" title="Marcar pessoa (recebe o aviso no sino)" aria-label="Marcar pessoa" onClick={marcar}>
          <AlternateEmailRounded fontSize="small" />
        </button>
        <input ref={seletor} type="file" multiple hidden onChange={(event) => { adicionar(event.target.files); event.target.value = ''; }} />
        <small className="lg-obs-dica">{enviando ?? (arrastando ? 'Solte os arquivos aqui' : `Ctrl+Enter para ${edicao ? 'salvar' : 'publicar'}`)}</small>
        {edicao && <button type="button" className="lg-btn lg-obs-cancelar" onClick={edicao.aoTerminar} disabled={!!enviando}>Cancelar</button>}
        <button type="button" className="lg-btn lg-btn-primario" onClick={publicar} disabled={!!enviando || vazio}>{edicao ? 'Salvar' : 'Publicar'}</button>
      </div>
    </div>
  );
}

/**
 * Observações da programação, da mais nova para a mais antiga; só o autor edita o texto ou exclui a sua. Em "ver", só a
 * leitura. Quem é marcado com @ recebe o aviso no sino (Functions logisticaObservacaoMencao e, na edição, quem entrou
 * agora, logisticaObservacaoMencaoEditada).
 */
export function ObservacoesProgramacao({ programacaoId, observacoes, eu, cadastros, marcaveis, podeEditar }: {
  programacaoId: string;
  observacoes: readonly Observacao[];
  eu: RefPessoa;
  cadastros: CadastrosLogistica;
  marcaveis: readonly PessoaMarcavel[];
  podeEditar: boolean;
}) {
  const nomeConhecido = (uid: string) => cadastros.nomePessoa(uid, marcaveis.find((pessoa) => pessoa.uid === uid)?.nome ?? '') || undefined;
  const nome = (uid: string) => nomeConhecido(uid) ?? 'alguém';
  const [erro, setErro] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const excluir = (observacao: Observacao) => {
    if (!window.confirm('Excluir esta observação e os arquivos dela?')) return;
    setErro(null);
    excluirObservacao(observacao).catch((error) => setErro(`Não foi possível excluir: ${mensagem(error)}`));
  };
  return (
    <div className="lg-obs">
      {podeEditar && <Escrever key={programacaoId} programacaoId={programacaoId} eu={eu} marcaveis={marcaveis} />}
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
            {observacao.editadoEm !== null && <small title={`Editada em ${quando(observacao.editadoEm)}`}>(editada)</small>}
            <span className="lg-espaco" />
            {podeEditar && observacao.autor.uid === eu.uid && editandoId !== observacao.id && (
              <>
                <button type="button" className="lg-btn-icone" title="Editar" aria-label="Editar observação" onClick={() => setEditandoId(observacao.id)}>
                  <EditOutlined fontSize="small" />
                </button>
                <button type="button" className="lg-btn-icone" title="Excluir" aria-label="Excluir observação" onClick={() => excluir(observacao)}>
                  <DeleteOutlineRounded fontSize="small" />
                </button>
              </>
            )}
          </header>
          {editandoId === observacao.id
            ? <Escrever programacaoId={programacaoId} eu={eu} marcaveis={marcaveis} edicao={{ observacao, nome: nomeConhecido, aoTerminar: () => setEditandoId(null) }} />
            : <TextoObservacao texto={observacao.texto} eu={eu.uid} nome={nome} />}
          <Anexos anexos={observacao.anexos} />
        </article>
      ))}
    </div>
  );
}
