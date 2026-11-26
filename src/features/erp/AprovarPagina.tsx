import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { Alert, Box, Button, FormControlLabel, IconButton, Popover, Radio, RadioGroup, TextField, Tooltip, Typography } from '@mui/material';
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DisabledByDefaultRoundedIcon from '@mui/icons-material/DisabledByDefaultRounded';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { editaArea } from '../../services/credenciais';
import { apagarImagemAprovacao, enviarImagemAprovacao, gravarAprovacao, ouvirAprovacao } from './aprovacoes';
import {
  LIMITE_DESCRICAO, LIMITE_IMAGENS, paginaErp, problemaDaDecisao, type AprovacaoPagina, type ImagemAprovacao, type SituacaoAprovacao,
} from './aprovacoesCore';
import { receberImagensParaAprovacao } from './imagemParaAprovacao';

// "Aprovar página" no cabeçalho das telas do /erp (Header.tsx, ao lado das Ferramentas): mostra a decisão da página e,
// para quem edita o ERP, aprova ou não, com descrição obrigatória quando não aprova. É a única coisa do ERP que grava
// (erp-aprovacoes); as telas seguem sem gravação. Imagens (2026-11-26): rabiscos do Canvas ("Mandar para Aprovar página",
// pela ponte imagemParaAprovacao.ts), prints colados com Ctrl+V ou anexados; sobem para o Storage ao salvar.
// The Manuscript, 01_FIRESTORE/COLECOES/erp-aprovacoes.md.

type Props = { titulo: string; botaoSx: object };

type Pendente = { id: string; imagem: Blob; url: string };
const novaPendente = (imagem: Blob): Pendente => ({ id: Math.random().toString(36).slice(2), imagem, url: URL.createObjectURL(imagem) });

/** Miniaturas das imagens da decisão; clicar abre a imagem inteira em outra aba. */
function Miniaturas({ imagens, onTirar }: { imagens: Array<{ chave: string; url: string; nova?: boolean }>; onTirar?: (chave: string) => void }) {
  if (!imagens.length) return null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
      {imagens.map((i, n) => (
        <Box key={i.chave} sx={{ position: 'relative', border: 1, borderColor: i.nova ? 'secondary.main' : 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover' }}>
          <Box component="a" href={i.url} target="_blank" rel="noopener noreferrer" title="Abrir a imagem inteira" sx={{ display: 'block' }}>
            <Box component="img" src={i.url} alt={`Imagem ${n + 1}${i.nova ? ' (nova)' : ''}`} sx={{ display: 'block', width: '100%', height: 80, objectFit: 'cover', objectPosition: 'top' }} />
          </Box>
          {onTirar && (
            <IconButton size="small" aria-label={`Tirar a imagem ${n + 1}`} onClick={() => onTirar(i.chave)}
              sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgb(255 255 255 / 0.9)', '&:hover': { bgcolor: '#fff' }, p: 0.25 }}>
              <CloseRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
      ))}
    </Box>
  );
}

const quando = (d: Date | null) =>
  d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

function Caixa({ pagina, titulo, botaoSx }: Props & { pagina: string }) {
  const { currentUser, authorizationProfile } = useAuth();
  const podeAprovar = editaArea(authorizationProfile, 'erp');
  // undefined = carregando; null = ainda não decidida.
  const [aprovacao, setAprovacao] = useState<AprovacaoPagina | null | undefined>(undefined);
  const [erroLeitura, setErroLeitura] = useState(false);
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [situacao, setSituacao] = useState<SituacaoAprovacao | ''>('');
  const [descricao, setDescricao] = useState('');
  const [problema, setProblema] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  // Imagens: as já gravadas que ficam (a pessoa pode tirar) e as novas, que sobem ao salvar.
  const [existentes, setExistentes] = useState<ImagemAprovacao[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const abertaRef = useRef(false);
  const aprovacaoRef = useRef<AprovacaoPagina | null | undefined>(undefined);
  useEffect(() => { abertaRef.current = Boolean(ancora); aprovacaoRef.current = aprovacao; });

  useEffect(() => ouvirAprovacao(
    pagina,
    (a) => { setAprovacao(a); setErroLeitura(false); },
    (e) => { console.error('[erp] aprovação da página não lida', e); setErroLeitura(true); },
  ), [pagina]);

  const iniciar = (a: AprovacaoPagina | null | undefined) => {
    setSituacao(a?.situacao ?? '');
    setDescricao(a?.descricao ?? '');
    setExistentes(a?.imagens ?? []);
    setProblema(null);
  };
  const abrir = () => { iniciar(aprovacao); setPendentes([]); setAncora(botaoRef.current); };
  const fechar = () => {
    setAncora(null);
    setPendentes((p) => { p.forEach((x) => URL.revokeObjectURL(x.url)); return []; });
  };
  const adicionar = (imagens: Blob[]) => {
    const validas = imagens.filter((i) => i.type.startsWith('image/'));
    if (!validas.length) return;
    setPendentes((p) => [...p, ...validas.map(novaPendente)]);
    setProblema(null);
  };

  // O Canvas manda o rabisco: a caixa abre (se estava fechada) com a imagem entre as novas.
  useEffect(() => {
    if (!podeAprovar) return undefined;
    return receberImagensParaAprovacao((imagem) => {
      if (!abertaRef.current) { iniciar(aprovacaoRef.current); setAncora(botaoRef.current); }
      setPendentes((p) => [...p, novaPendente(imagem)]);
    });
  }, [podeAprovar]);

  const colar = (e: ClipboardEvent) => {
    const imagens = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (!imagens.length || !podeAprovar) return;
    e.preventDefault();
    adicionar(imagens);
  };

  const salvar = async () => {
    const p = problemaDaDecisao(situacao, descricao, [...existentes, ...pendentes.map((x) => ({ bytes: x.imagem.size }))]);
    if (p) return setProblema(p);
    if (!currentUser || !situacao) return;
    setGravando(true);
    const novas: ImagemAprovacao[] = [];
    try {
      for (const x of pendentes) novas.push(await enviarImagemAprovacao(pagina, x.imagem));
      const nome = authorizationProfile?.nome || currentUser.displayName || currentUser.email || 'Equipe Ledur';
      await gravarAprovacao(pagina, titulo || pagina, situacao, descricao, { uid: currentUser.uid, nome }, [...existentes, ...novas]);
      // As imagens tiradas da decisão saem do Storage depois de gravar.
      const ficam = new Set(existentes.map((i) => i.path));
      (aprovacao?.imagens ?? []).filter((i) => !ficam.has(i.path))
        .forEach((i) => apagarImagemAprovacao(i.path).catch((err: unknown) => console.warn('[erp] imagem não apagada', err)));
      fechar();
    } catch (e) {
      console.error('[erp] aprovação da página não gravada', e);
      novas.forEach((i) => apagarImagemAprovacao(i.path).catch(() => undefined));
      setProblema('Não foi possível gravar. Tente de novo.');
    } finally {
      setGravando(false);
    }
  };

  const estado = aprovacao?.situacao;
  const rotulo = estado === 'aprovada' ? 'Página aprovada' : estado === 'reprovada' ? 'Não aprovada' : 'Aprovar página';
  const Icone = estado === 'aprovada' ? CheckBoxRoundedIcon : estado === 'reprovada' ? DisabledByDefaultRoundedIcon : CheckBoxOutlineBlankRoundedIcon;
  const cor = estado === 'aprovada'
    ? { bgcolor: 'success.main', color: 'success.contrastText', '&:hover': { bgcolor: 'success.dark' } }
    : estado === 'reprovada'
      ? { bgcolor: 'warning.main', color: 'warning.contrastText', '&:hover': { bgcolor: 'warning.dark' } }
      : {};

  return (
    <>
      <Tooltip title={estado ? 'Ver ou mudar a aprovação desta página' : 'Aprovar ou não esta página do ERP'}>
        <Button ref={botaoRef} aria-label={rotulo} onClick={abrir} sx={{ ...botaoSx, ...cor, minHeight: 40, minWidth: 40, px: { xs: 1, sm: 1.5 }, gap: 1, fontWeight: 500, fontSize: 14 }}>
          <Icone fontSize="small" />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, whiteSpace: 'nowrap' }}>{rotulo}</Box>
        </Button>
      </Tooltip>
      <Popover
        open={Boolean(ancora)} anchorEl={ancora} onClose={fechar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 460, maxWidth: 'calc(100vw - 16px)' }, onPaste: colar } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', pl: 2.25, pr: 1.5, pt: 1.75, pb: 0.5 }}>
          <Typography component="h3" sx={{ fontSize: 22, fontWeight: 600, flex: 1 }}>Aprovar página</Typography>
          <Tooltip title="Fechar">
            <IconButton size="small" aria-label="Fechar a aprovação" onClick={fechar}><CloseRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, px: 2.25, pt: 0.5, pb: 2 }}>
          <Box>
            <Typography sx={{ fontWeight: 600 }}>{titulo || pagina}</Typography>
            <Typography variant="body2" color="text.secondary">{pagina}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Página aprovada é a que pode ganhar a gravação dos dados. Se não aprovar, descreva o que falta ou está errado.
          </Typography>
          {erroLeitura && <Alert severity="error">Não foi possível ler a aprovação desta página.</Alert>}
          {aprovacao && (
            <Alert severity={aprovacao.situacao === 'aprovada' ? 'success' : 'warning'}>
              <strong>{aprovacao.situacao === 'aprovada' ? 'Aprovada' : 'Não aprovada'}</strong>
              {aprovacao.decididoPor && ` por ${aprovacao.decididoPor.nome}`}
              {aprovacao.decididoEm && ` em ${quando(aprovacao.decididoEm)}`}
              {aprovacao.descricao && <Box sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{aprovacao.descricao}</Box>}
            </Alert>
          )}
          {podeAprovar ? (
            <>
              <RadioGroup row value={situacao} onChange={(e) => { setSituacao(e.target.value as SituacaoAprovacao); setProblema(null); }}>
                <FormControlLabel value="aprovada" control={<Radio />} label="Aprovar" />
                <FormControlLabel value="reprovada" control={<Radio />} label="Não aprovar" />
              </RadioGroup>
              <TextField
                label={situacao === 'reprovada' ? 'Descrição: o que falta ou está errado' : 'Descrição (opcional)'}
                required={situacao === 'reprovada'} multiline minRows={3} maxRows={10} value={descricao}
                onChange={(e) => { setDescricao(e.target.value); setProblema(null); }}
                slotProps={{ htmlInput: { maxLength: LIMITE_DESCRICAO } }}
              />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 600, flex: 1 }}>Imagens</Typography>
                  <Button component="label" size="small" startIcon={<AddPhotoAlternateOutlinedIcon />} disabled={existentes.length + pendentes.length >= LIMITE_IMAGENS}>
                    Anexar
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => { adicionar([...(e.target.files ?? [])]); e.target.value = ''; }} />
                  </Button>
                </Box>
                <Miniaturas
                  imagens={[...existentes.map((i) => ({ chave: i.path, url: i.url })), ...pendentes.map((x) => ({ chave: x.id, url: x.url, nova: true }))]}
                  onTirar={(chave) => {
                    setExistentes((l) => l.filter((i) => i.path !== chave));
                    setPendentes((l) => l.filter((x) => { if (x.id === chave) URL.revokeObjectURL(x.url); return x.id !== chave; }));
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  Para mostrar o que mudar no layout: rabisque a tela com o Canvas (Ferramentas) e use "Mandar para Aprovar página", ou cole um print aqui com Ctrl+V.
                </Typography>
              </Box>
              {problema && <Alert severity="error">{problema}</Alert>}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button onClick={fechar}>Cancelar</Button>
                <Button variant="contained" onClick={salvar} disabled={gravando}>{gravando ? 'Gravando…' : 'Salvar'}</Button>
              </Box>
            </>
          ) : (
            <>
              <Miniaturas imagens={(aprovacao?.imagens ?? []).map((i) => ({ chave: i.path, url: i.url }))} />
              <Typography variant="body2">
                {aprovacao === null ? 'Esta página ainda não foi avaliada. ' : ''}Só quem edita o ERP aprova páginas.
              </Typography>
            </>
          )}
        </Box>
      </Popover>
    </>
  );
}

/** A caixa só aparece nas telas do ERP; trocar de página recomeça com a decisão da nova. */
export default function AprovarPagina({ titulo, botaoSx }: Props) {
  const { pathname } = useLocation();
  const pagina = paginaErp(pathname);
  return pagina ? <Caixa key={pagina} pagina={pagina} titulo={titulo} botaoSx={botaoSx} /> : null;
}
