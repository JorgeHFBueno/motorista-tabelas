import { useEffect, useState, type MouseEvent } from 'react';
import { Alert, Box, Button, FormControlLabel, IconButton, Popover, Radio, RadioGroup, TextField, Tooltip, Typography } from '@mui/material';
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DisabledByDefaultRoundedIcon from '@mui/icons-material/DisabledByDefaultRounded';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { editaArea } from '../../services/credenciais';
import { gravarAprovacao, ouvirAprovacao } from './aprovacoes';
import { LIMITE_DESCRICAO, paginaErp, problemaDaDecisao, type AprovacaoPagina, type SituacaoAprovacao } from './aprovacoesCore';

// "Aprovar página" no cabeçalho das telas do /erp (Header.tsx, ao lado das Ferramentas): mostra a decisão da página e,
// para quem edita o ERP, aprova ou não, com descrição obrigatória quando não aprova. É a única coisa do ERP que grava
// (erp-aprovacoes); as telas seguem sem gravação. The Manuscript, 01_FIRESTORE/COLECOES/erp-aprovacoes.md.

type Props = { titulo: string; botaoSx: object };

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

  useEffect(() => ouvirAprovacao(
    pagina,
    (a) => { setAprovacao(a); setErroLeitura(false); },
    (e) => { console.error('[erp] aprovação da página não lida', e); setErroLeitura(true); },
  ), [pagina]);

  const abrir = (e: MouseEvent<HTMLElement>) => {
    setAncora(e.currentTarget);
    setSituacao(aprovacao?.situacao ?? '');
    setDescricao(aprovacao?.descricao ?? '');
    setProblema(null);
  };

  const salvar = async () => {
    const p = problemaDaDecisao(situacao, descricao);
    if (p) return setProblema(p);
    if (!currentUser || !situacao) return;
    setGravando(true);
    try {
      const nome = authorizationProfile?.nome || currentUser.displayName || currentUser.email || 'Equipe Ledur';
      await gravarAprovacao(pagina, titulo || pagina, situacao, descricao, { uid: currentUser.uid, nome });
      setAncora(null);
    } catch (e) {
      console.error('[erp] aprovação da página não gravada', e);
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
        <Button aria-label={rotulo} onClick={abrir} sx={{ ...botaoSx, ...cor, minHeight: 40, minWidth: 40, px: { xs: 1, sm: 1.5 }, gap: 1, fontWeight: 500, fontSize: 14 }}>
          <Icone fontSize="small" />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, whiteSpace: 'nowrap' }}>{rotulo}</Box>
        </Button>
      </Tooltip>
      <Popover
        open={Boolean(ancora)} anchorEl={ancora} onClose={() => setAncora(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 420, maxWidth: 'calc(100vw - 16px)' } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', pl: 2.25, pr: 1.5, pt: 1.75, pb: 0.5 }}>
          <Typography component="h3" sx={{ fontSize: 22, fontWeight: 600, flex: 1 }}>Aprovar página</Typography>
          <Tooltip title="Fechar">
            <IconButton size="small" aria-label="Fechar a aprovação" onClick={() => setAncora(null)}><CloseRoundedIcon fontSize="small" /></IconButton>
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
              {problema && <Alert severity="error">{problema}</Alert>}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button onClick={() => setAncora(null)}>Cancelar</Button>
                <Button variant="contained" onClick={salvar} disabled={gravando}>{gravando ? 'Gravando…' : 'Salvar'}</Button>
              </Box>
            </>
          ) : (
            <Typography variant="body2">
              {aprovacao === null ? 'Esta página ainda não foi avaliada. ' : ''}Só quem edita o ERP aprova páginas.
            </Typography>
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
