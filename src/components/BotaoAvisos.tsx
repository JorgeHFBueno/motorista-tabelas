import { useEffect, useState } from 'react';
import { Avatar, Box, ButtonBase, FormControlLabel, IconButton, InputAdornment, Menu, MenuItem, Popover, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { AtSign, Bell, Building2, CheckCheck, LayoutGrid, MoreHorizontal, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { marcarAvisoComoLido, marcarTodosComoLidos, observarAvisos } from '../services/avisos';
import { agruparAvisos, filtrarAvisos, tempoRelativo, type Aviso } from '../services/avisosCore';

// Sino do sistema, no cabeçalho de todas as telas: os avisos da pessoa (avisos/{uid}/itens), de qualquer área, em tempo
// real. O painel segue o do monday: busca, "Só não lidos", grupos por período e, em cada cartão, o tempo e a bolinha de
// não lido à direita. Clicar marca como lido e abre a tela do aviso (rota).

const CORES = ['#579bfc', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#037f4c', '#ff642e', '#0086c0'];
const corDe = (nome: string) => CORES[[...nome].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7) % CORES.length];
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

type Props = { botaoSx: object };

export default function BotaoAvisos({ botaoSx }: Props) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const navigate = useNavigate();
  const [lista, setLista] = useState<Aviso[]>([]);
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [ancoraMais, setAncoraMais] = useState<HTMLElement | null>(null);
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!uid) { setLista([]); return undefined; }
    return observarAvisos(uid, setLista);
  }, [uid]);

  const naoLidas = lista.filter(n => !n.lida).length;
  const fechar = () => { setAncoraMais(null); setAncora(null); };
  const abrir = (n: Aviso) => {
    fechar();
    if (uid && !n.lida) marcarAvisoComoLido(uid, n.id).catch(e => console.warn('[avisos] não marcado como lido', e));
    if (n.rota) navigate(n.rota);
  };
  const marcarTodos = () => {
    setAncoraMais(null);
    if (uid) marcarTodosComoLidos(uid).catch(e => console.warn('[avisos] não marcados como lidos', e));
  };
  const filtrados = filtrarAvisos(soNaoLidas ? lista.filter(n => !n.lida) : lista, busca, n => [n.deNome, n.titulo, n.local, n.mensagem]);
  const grupos = agruparAvisos(filtrados, new Date(), n => n.criadoEm);

  return (
    <>
      <Tooltip title="Avisos">
        <IconButton
          aria-label={`Avisos${naoLidas ? `: ${naoLidas} não lidos` : ''}`}
          onClick={(e) => setAncora(e.currentTarget)}
          sx={{ ...botaoSx, width: 40, height: 40, position: 'relative' }}
        >
          <Bell size={20} />
          {naoLidas > 0 && (
            <Box component="span" sx={{
              position: 'absolute', top: -5, right: -5, bgcolor: '#d83a52', color: '#fff', fontSize: 10, fontWeight: 700,
              minWidth: 18, height: 18, borderRadius: '9px', display: 'grid', placeItems: 'center', px: '4px', border: '2px solid #12293b',
            }}>
              {naoLidas > 9 ? '9+' : naoLidas}
            </Box>
          )}
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(ancora)} anchorEl={ancora} onClose={fechar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 460, maxWidth: 'calc(100vw - 16px)', maxHeight: 'min(620px, calc(100vh - 16px))', display: 'flex', flexDirection: 'column', overflow: 'hidden' } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 2.25, pr: 1.5, pt: 1.75, pb: 0.75 }}>
          <Typography component="h3" sx={{ fontSize: 22, fontWeight: 600, flex: 1 }}>Avisos</Typography>
          <Tooltip title="Mais opções">
            <IconButton size="small" aria-label="Mais opções dos avisos" onClick={(e) => setAncoraMais(e.currentTarget)}><MoreHorizontal size={18} /></IconButton>
          </Tooltip>
          <Tooltip title="Fechar">
            <IconButton size="small" aria-label="Fechar os avisos" onClick={fechar}><X size={18} /></IconButton>
          </Tooltip>
          <Menu anchorEl={ancoraMais} open={Boolean(ancoraMais)} onClose={() => setAncoraMais(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
            <MenuItem onClick={marcarTodos} sx={{ gap: 1, fontSize: 14 }}><CheckCheck size={15} />Marcar todos como lidos</MenuItem>
          </Menu>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 12px', px: 2.25, pt: 1, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            size="small" placeholder="Buscar por pessoa, título ou local" value={busca} onChange={e => setBusca(e.target.value)}
            sx={{ flex: 1, minWidth: 0, '& input': { fontSize: 13 } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={15} /></InputAdornment> } }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={soNaoLidas} onChange={e => setSoNaoLidas(e.target.checked)} />}
            label="Só não lidos" sx={{ m: 0, gap: 0.5, '& .MuiFormControlLabel-label': { fontSize: 13, whiteSpace: 'nowrap' } }}
          />
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, pt: 0.5, pb: 1.5 }}>
          {!grupos.length && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.75, py: 2 }}>
              {busca.trim() ? 'Nenhum aviso encontrado.' : `Nenhum aviso${soNaoLidas ? ' não lido' : ''}.`}
            </Typography>
          )}
          {grupos.map(g => (
            <Box component="section" key={g.periodo}>
              <Typography component="h4" sx={{ m: '12px 6px 8px', fontSize: 14, fontWeight: 700 }}>{g.periodo}</Typography>
              {g.avisos.map(n => <Cartao key={n.id} aviso={n} onAbrir={() => abrir(n)} />)}
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  );
}

function Cartao({ aviso: n, onAbrir }: { aviso: Aviso; onAbrir: () => void }) {
  const nome = n.deNome ?? '';
  const duasLinhas = { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' } as const;
  return (
    <ButtonBase
      onClick={onAbrir}
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: 1.25, width: '100%', textAlign: 'left', p: 1.5, mb: 1, borderRadius: 2,
        border: 1, borderColor: n.lida ? 'divider' : 'transparent', bgcolor: n.lida ? 'background.paper' : '#e5f0ff',
        '&:hover': { bgcolor: n.lida ? 'action.hover' : '#d4e5ff' },
      }}
    >
      <Box sx={{ position: 'relative', flex: 'none', display: 'inline-flex' }}>
        <Avatar sx={{ width: 34, height: 34, fontSize: 13, bgcolor: nome ? corDe(nome) : 'primary.main' }}>{nome ? iniciais(nome) : <Bell size={16} />}</Avatar>
        {n.tipo === 'mencao' && (
          <Box component="span" sx={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: '50%', bgcolor: '#0073ea', color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #fff' }}>
            <AtSign size={11} />
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, flex: 1, minWidth: 0, fontSize: 13 }}>
        <Box component="span" sx={duasLinhas}>{nome ? <><strong>{nome}</strong> {n.titulo}</> : <strong>{n.titulo}</strong>}</Box>
        {n.mensagem && <Box component="span" sx={{ ...duasLinhas, color: 'text.secondary' }}>{n.mensagem}</Box>}
        {n.local && (
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', '& svg': { flex: 'none' } }}>
            {n.area === 'friday' ? <LayoutGrid size={13} /> : <Building2 size={13} />}{n.local}
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 'none', color: 'text.secondary', fontSize: 12 }}>
        <small>{tempoRelativo(n.criadoEm)}</small>
        {!n.lida && <Box component="span" aria-label="Não lido" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: '#0073ea' }} />}
      </Box>
    </ButtonBase>
  );
}
