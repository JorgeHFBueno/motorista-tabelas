import { Alert, Autocomplete, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { itemFrotaLabel, obraLabel, type ItemFrotaV2, type ObraV2 } from '../../utils/cadastrosV2';
import {
  LOCAL_PADRAO_CHEGADA, MOTIVOS_SAIDA, filtrarObras, lerKm, novaAtividade, validarKm, validarMotivo, type Pessoa, type TipoAtividade,
} from './domain/atividade';
import { lerFabrica, listarMotoristas, listarObrasAtividade, listarVeiculosAtividade } from './data/atividadesFirestore';
import { enviador, useFilaEnvio } from './data/filaEnvio';
import AjudaKm from './components/AjudaKm';

type Dados = { veiculos: ItemFrotaV2[]; obras: ObraV2[]; fabrica: ObraV2 | null; motoristas: Pessoa[] };
type Carga = { estado: 'carregando' } | { estado: 'erro' } | { estado: 'pronto'; dados: Dados };

const botaoGrande = { minHeight: 52, fontSize: 16, fontWeight: 700, textTransform: 'none' } as const;
const numero = (valor: number) => valor.toLocaleString('pt-BR');

/**
 * /motorista/saida e /motorista/chegada: a Saída e a Chegada do app no WEB (The Manuscript, 03_APLICACAO_WEB). O lançamento
 * vai para a fila do aparelho e é gravado quando houver conexão; o Histórico mostra se já foi.
 */
export default function SaidaChegadaPage({ tipo }: { tipo: TipoAtividade }) {
  const navigate = useNavigate();
  const { currentUser, authorizationProfile } = useAuth();
  const fila = useFilaEnvio();
  const chegada = tipo === 'chegada';
  const adm2 = authorizationProfile?.adm2 === true;
  const eu = useMemo<Pessoa | null>(() => {
    const uid = currentUser?.uid;
    const nome = authorizationProfile?.nome ?? currentUser?.email ?? '';
    return uid && nome ? { uid, nome } : null;
  }, [currentUser, authorizationProfile?.nome]);

  const [carga, setCarga] = useState<Carga>({ estado: 'carregando' });
  const [motorista, setMotorista] = useState<Pessoa | null>(eu);
  const [veiculo, setVeiculo] = useState<ItemFrotaV2 | null>(null);
  const [km, setKm] = useState('');
  const [obra, setObra] = useState<ObraV2 | null>(null);
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarga({ estado: 'carregando' });
    try {
      // O adm2 registra por um motorista; sem a lista (sem conexão), registra para si.
      const motoristas = adm2 ? listarMotoristas().catch(() => [] as Pessoa[]) : Promise.resolve([] as Pessoa[]);
      const [veiculos, obras, fabrica] = await Promise.all([
        listarVeiculosAtividade(),
        chegada ? Promise.resolve([] as ObraV2[]) : listarObrasAtividade(),
        chegada ? lerFabrica() : Promise.resolve(null),
      ]);
      setCarga({ estado: 'pronto', dados: { veiculos, obras, fabrica, motoristas: await motoristas } });
    } catch (error) {
      console.error('Saída/Chegada: falha ao carregar', error);
      setCarga({ estado: 'erro' });
    }
  }, [adm2, chegada]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { setMotorista((atual) => atual ?? eu); }, [eu]);

  const dados = carga.estado === 'pronto' ? carga.dados : null;
  const fabrica = dados?.fabrica ?? null;
  // Quem registra para si entra na lista mesmo sem a credencial motorista (caso do adm2).
  const opcoesMotorista = useMemo(() => {
    const lista = dados?.motoristas ?? [];
    return eu && !lista.some((m) => m.uid === eu.uid) ? [eu, ...lista] : lista;
  }, [dados?.motoristas, eu]);

  const ultimo = veiculo?.quilometragemUltima ?? null;
  const erroKm = veiculo ? validarKm(km, ultimo, tipo) : null;
  const erroMotivo = chegada ? null : validarMotivo(motivo);

  const salvar = async () => {
    setTentou(true);
    setErro(null);
    const valorKm = lerKm(km);
    const obraDoLancamento = chegada ? fabrica : obra;
    if (!eu || !motorista || !veiculo || !obraDoLancamento || valorKm == null || erroKm || erroMotivo) {
      setErro('Confira os campos obrigatórios.');
      return;
    }
    setSalvando(true);
    try {
      const pendente = novaAtividade({
        // O Local não aparece na Saída (decisão de 2026-11-18): vai o da obra escolhida; na Chegada, o da Fábrica.
        tipo, veiculo, km: valorKm, obra: obraDoLancamento, local: obraDoLancamento.local ?? '', motivo,
        motorista, criadoPor: eu, agora: new Date(),
      });
      await enviador.lancar(pendente);
      navigate('/motorista/historico', { state: { aviso: chegada ? 'Chegada registrada.' : 'Saída registrada.' } });
    } catch (error) {
      console.error('Saída/Chegada: falha ao guardar no aparelho', error);
      setErro('Não foi possível guardar neste aparelho. Tente de novo.');
      setSalvando(false);
    }
  };

  return (
    // width 100%: na coluna flex da página, com mx auto, a caixa encolheria ou cresceria conforme o conteúdo.
    <Box sx={{ width: '100%', maxWidth: 640, mx: 'auto', px: 2, py: 2, pb: 6 }}>
      {fila.pendentes.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" href="/motorista/historico">Ver</Button>}
        >
          {fila.pendentes.length === 1 ? '1 lançamento aguardando envio.' : `${fila.pendentes.length} lançamentos aguardando envio.`}
        </Alert>
      )}
      {carga.estado === 'carregando' && <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress /></Stack>}
      {carga.estado === 'erro' && (
        <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
          <Typography textAlign="center">Não foi possível carregar os veículos. Sem internet, a tela usa o que este aparelho já carregou antes.</Typography>
          <Button variant="outlined" onClick={() => void carregar()}>Tentar de novo</Button>
        </Stack>
      )}
      {dados && chegada && !fabrica && (
        <Alert severity="error">A obra Fábrica não foi encontrada. Abra esta tela com internet ao menos uma vez.</Alert>
      )}
      {dados && (!chegada || fabrica) && (
        <Stack spacing={2.5}>
          {dados.veiculos.length === 0 && (
            <Alert severity="info">Nenhum veículo carregado. Abra esta tela com internet ao menos uma vez neste aparelho.</Alert>
          )}
          {adm2 && (
            <Autocomplete
              options={opcoesMotorista}
              value={motorista}
              disabled={salvando}
              onChange={(_, m) => setMotorista(m)}
              getOptionLabel={(m) => m.nome}
              isOptionEqualToValue={(a, b) => a.uid === b.uid}
              renderInput={(params) => (
                <TextField {...params} label="Motorista" error={tentou && !motorista} helperText={tentou && !motorista ? 'Escolha o motorista.' : ' '} />
              )}
            />
          )}
          <Autocomplete
            options={dados.veiculos}
            value={veiculo}
            disabled={salvando}
            onChange={(_, v) => {
              setVeiculo(v);
              // Começa com o último KM do cadastro; o motorista ajusta.
              setKm(v?.quilometragemUltima != null ? String(v.quilometragemUltima) : '');
            }}
            getOptionLabel={itemFrotaLabel}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText="Nenhum veículo encontrado"
            renderInput={(params) => (
              <TextField {...params} label="Veículo" error={tentou && !veiculo} helperText={tentou && !veiculo ? 'Escolha o veículo.' : ' '} />
            )}
          />
          <TextField
            label="KM"
            value={km}
            disabled={salvando || !veiculo}
            onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))}
            error={tentou && Boolean(erroKm)}
            helperText={(tentou && erroKm) || (veiculo
              ? (ultimo == null ? 'Sem KM anterior no cadastro.' : `Último KM: ${numero(ultimo)}`)
              : 'Escolha o veículo primeiro.')}
            slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', autoComplete: 'off' } }}
          />
          <AjudaKm />
          {chegada ? (
            <>
              <TextField label="Obra" value={fabrica?.nomeObra || '-'} slotProps={{ input: { readOnly: true } }} variant="filled" />
              <TextField label="Sinônimo" value={fabrica?.siglaObra || '-'} slotProps={{ input: { readOnly: true } }} variant="filled" />
              <TextField label="Local" value={fabrica?.local?.trim() || LOCAL_PADRAO_CHEGADA} slotProps={{ input: { readOnly: true } }} variant="filled" />
            </>
          ) : (
            <>
              <Autocomplete
                options={dados.obras}
                value={obra}
                disabled={salvando}
                onChange={(_, o) => setObra(o)}
                filterOptions={(opcoes, { inputValue }) => filtrarObras(opcoes, inputValue)}
                getOptionLabel={obraLabel}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderOption={({ key, ...props }, o) => (
                  <li key={key} {...props}>
                    <Box>
                      <Typography>{obraLabel(o)}</Typography>
                      {o.local && <Typography variant="body2" color="text.secondary">{o.local}</Typography>}
                    </Box>
                  </li>
                )}
                noOptionsText="Nenhuma obra encontrada"
                renderInput={(params) => (
                  <TextField {...params} label="Obra" error={tentou && !obra} helperText={tentou && !obra ? 'Escolha a obra.' : 'Busque pelo nome, sinônimo ou local.'} />
                )}
              />
              <Autocomplete
                freeSolo
                options={MOTIVOS_SAIDA}
                inputValue={motivo}
                disabled={salvando}
                onInputChange={(_, texto) => setMotivo(texto)}
                renderInput={(params) => (
                  <TextField {...params} label="Motivo" error={tentou && Boolean(erroMotivo)} helperText={(tentou && erroMotivo) || ' '} />
                )}
              />
            </>
          )}
          {erro && <Alert severity="error">{erro}</Alert>}
          <Button variant="contained" size="large" sx={botaoGrande} disabled={salvando} onClick={() => void salvar()}>
            {salvando ? <CircularProgress size={22} color="inherit" /> : chegada ? 'Salvar Chegada' : 'Salvar Saída'}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
