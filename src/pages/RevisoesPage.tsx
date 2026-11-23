import { useEffect, useMemo, useState } from 'react';
import { Alert, Chip, Container, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { ptBR } from '@mui/x-data-grid/locales';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listarTodasRevisoes } from '../features/revisao/data/revisaoFirestore';
import type { RevisaoLida } from '../features/revisao/domain/documento';
import { TIPOS, tituloDe } from '../features/revisao/domain/listas';
import { estaAberta, exibirDia, horimetroDe, tituloStatus } from '../features/revisao/domain/registro';
import { abreEmNovaGuia } from '../utils/novaGuia';

const urlRevisao = (id: string) => `/mecanica/revisoes/${encodeURIComponent(id)}`;
const numero = new Intl.NumberFormat('pt-BR');

type Linha = {
  id: string;
  entrada: string;
  retorno: string;
  veiculoId: string;
  identificador: string;
  nome: string;
  tipo: string;
  aberta: boolean;
  situacao: string;
  motivo: string;
  itens: number;
  medidor: string;
  abertaPor: string;
};

const linhaDe = ({ registro: r, criadoPorNome }: RevisaoLida): Linha => ({
  id: r.id,
  entrada: r.dataEntrada ?? '',
  retorno: r.dataRetorno ?? '',
  veiculoId: r.veiculo.id,
  identificador: r.veiculo.identificador,
  nome: r.veiculo.nome,
  tipo: tituloDe(TIPOS, r.tipo) ?? '—',
  aberta: estaAberta(r),
  situacao: tituloStatus(r),
  motivo: r.motivo.trim(),
  itens: r.itens.length,
  medidor: r.medidor == null ? '—' : `${horimetroDe(r.veiculo) ? 'Hor.' : 'KM'} ${numero.format(r.medidor)}`,
  abertaPor: criadoPorNome || '—',
});

/**
 * /mecanica/revisoes: as revisões do mecânico (a Manutenção do app e a Revisão de /motorista/revisao, coleção
 * manutencoes-v2), só consulta, como os Checklists. Filtros na URL: situação, tipo e veículo.
 */
export default function RevisoesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const situacao = searchParams.get('situacao') ?? 'todas';
  const tipo = searchParams.get('tipo') ?? 'todos';
  const veiculo = searchParams.get('veiculo') ?? '';

  useEffect(() => {
    let active = true;
    listarTodasRevisoes()
      .then((data) => active && setRows(data.map(linhaDe)))
      .catch(() => active && setErro('Não foi possível carregar as revisões.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const veiculos = useMemo(() => [...new Map(rows.filter((r) => r.veiculoId).map((r) => [r.veiculoId, r.identificador])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const filtrados = useMemo(() => rows.filter((r) =>
    (situacao === 'todas' || (situacao === 'abertas') === r.aberta)
    && (tipo === 'todos' || r.tipo === tituloDe(TIPOS, tipo))
    && (!veiculo || r.veiculoId === veiculo)), [rows, situacao, tipo, veiculo]);
  const setFiltro = (chave: string, valor: string) => setSearchParams((prev) => {
    const p = new URLSearchParams(prev);
    if (valor && valor !== 'todos' && valor !== 'todas') p.set(chave, valor); else p.delete(chave);
    return p;
  }, { replace: true });

  const colunas: GridColDef<Linha>[] = [
    { field: 'entrada', headerName: 'Foi ao mecânico', minWidth: 130, flex: 0.8, valueFormatter: (value: string) => (value ? exibirDia(value) : '—') },
    { field: 'retorno', headerName: 'Voltou', minWidth: 110, flex: 0.7, valueFormatter: (value: string) => (value ? exibirDia(value) : '—') },
    { field: 'identificador', headerName: 'Veículo', minWidth: 130, flex: 0.9 },
    { field: 'nome', headerName: 'Descrição', minWidth: 150, flex: 1.1 },
    { field: 'tipo', headerName: 'Tipo', minWidth: 110, flex: 0.7 },
    {
      field: 'situacao', headerName: 'Situação', minWidth: 140, flex: 0.8,
      renderCell: ({ row }) => <Chip size="small" color={row.aberta ? 'warning' : 'default'} variant={row.aberta ? 'outlined' : 'filled'} label={row.situacao} />,
    },
    { field: 'motivo', headerName: 'Motivo', minWidth: 180, flex: 1.5 },
    { field: 'itens', headerName: 'Itens', type: 'number', minWidth: 70, flex: 0.4 },
    { field: 'medidor', headerName: 'KM/Horímetro', minWidth: 120, flex: 0.8, sortable: false },
    { field: 'abertaPor', headerName: 'Aberta por', minWidth: 150, flex: 1 },
  ];

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Cada ida do veículo ou da máquina ao mecânico, registrada no app ou na Revisão do celular. Em manutenção até informarem a data que voltou.
      </Typography>
      {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="Situação" value={situacao} onChange={(e) => setFiltro('situacao', e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="todas">Todas</MenuItem>
          <MenuItem value="abertas">Em manutenção</MenuItem>
          <MenuItem value="fechadas">Fechadas</MenuItem>
        </TextField>
        <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setFiltro('tipo', e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="todos">Preventiva e corretiva</MenuItem>
          {TIPOS.map((t) => <MenuItem key={t.id} value={t.id}>{t.titulo}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Veículo" value={veiculo} onChange={(e) => setFiltro('veiculo', e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Todos</MenuItem>
          {veiculos.map(([id, identificador]) => <MenuItem key={id} value={id}>{identificador}</MenuItem>)}
        </TextField>
      </Stack>
      <div style={{ height: 650, width: '100%' }}>
        <DataGrid
          rows={filtrados}
          columns={colunas}
          loading={loading}
          density="compact"
          disableRowSelectionOnClick
          onRowClick={(p, e) => abreEmNovaGuia(urlRevisao(String(p.id)), navigate).onClick(e)}
          // The row is not a link: the middle button opens the record in a new tab through the row's data-id.
          slotProps={{
            row: {
              onAuxClick: (e) => abreEmNovaGuia(urlRevisao(e.currentTarget.dataset.id ?? ''), navigate).onAuxClick(e),
              onMouseDown: (e) => abreEmNovaGuia(urlRevisao(e.currentTarget.dataset.id ?? ''), navigate).onMouseDown(e),
            },
          }}
          initialState={{ sorting: { sortModel: [{ field: 'entrada', sort: 'desc' }] } }}
          localeText={{ ...ptBR.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: 'Nenhuma revisão encontrada.' }}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </div>
    </Container>
  );
}
