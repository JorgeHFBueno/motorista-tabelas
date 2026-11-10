import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Stack } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import FrotaAnalyticsPanel from '../components/FrotaAnalyticsPanel';
import FrotaGastosPorVeiculo from '../components/FrotaGastosPorVeiculo';
import { listItensFrota } from '../services/veiculos.service';
import type { VehicleAnalyticsIdentity } from '../services/frota-analytics.service';
import type { ItemFrotaV2 } from '../utils/cadastrosV2';

export default function FrotaAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [itens, setItens] = useState<ItemFrotaV2[]>([]);
  const [vehicles, setVehicles] = useState<VehicleAnalyticsIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const vehicleId = searchParams.get('veiculo');

  useEffect(() => {
    let active = true;

    async function loadVehicles() {
      setLoading(true);
      setError(null);
      try {
        const items = await listItensFrota();
        if (!active) return;
        setItens(items);
        setVehicles(items.map(item => ({
          id: item.id,
          identificador: item.identificador,
          ...(item.categoria === 'PLACA' ? { placa: item.identificador } : { extra: item.identificador }),
          tipo: typeof (item.raw.cadastro as { tipoVeiculo?: unknown } | undefined)?.tipoVeiculo === 'string' ? (item.raw.cadastro as { tipoVeiculo: string }).tipoVeiculo : null,
          quilometragemInicial: item.quilometragemInicial,
          dataUltimaAtualizacao: item.dataUltimaAtualizacao,
        })));
      } catch (loadError) {
        console.error('Erro ao carregar veículos para Analytics', loadError);
        if (active) setError('Não foi possível carregar os veículos para Analytics.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadVehicles();
    return () => { active = false; };
  }, []);

  const selectedVehicle = useMemo(
    () => vehicles.find(vehicle => vehicle.id === vehicleId),
    [vehicleId, vehicles],
  );

  return (
    <Container sx={{ py: 4 }}>
      {selectedVehicle && (
        <Stack direction="row" justifyContent="flex-end">
          <Button variant="text" onClick={() => setSearchParams({}, { replace: true })}>Visão geral</Button>
        </Stack>
      )}

      {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
      {!loading && vehicleId && !selectedVehicle && !error && <Alert severity="warning" sx={{ mt: 3 }}>O veículo informado não foi encontrado. Exibindo a visão geral.</Alert>}
      {loading ? <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box> : !error && <Box mt={3}><FrotaAnalyticsPanel vehicles={vehicles} vehicle={selectedVehicle} />{!selectedVehicle && <FrotaGastosPorVeiculo veiculos={itens} />}</Box>}
    </Container>
  );
}
