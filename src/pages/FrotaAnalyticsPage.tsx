import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { collection, getDocs } from 'firebase/firestore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import FrotaAnalyticsPanel from '../components/FrotaAnalyticsPanel';
import { db } from '../firebase';
import type { VehicleAnalyticsIdentity } from '../services/frota-analytics.service';

export default function FrotaAnalyticsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
        const snapshot = await getDocs(collection(db, 'veiculos'));
        if (!active) return;
        setVehicles(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
        <Box>
          <Typography variant="h4">Analytics da Frota</Typography>
          <Typography variant="subtitle1" color="text.secondary">KPI piloto · Jan–Ago 2026</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {selectedVehicle && <Button variant="text" onClick={() => setSearchParams({}, { replace: true })}>Visão geral</Button>}
          <Button variant="outlined" onClick={() => navigate('/frota')}>Voltar para Frota</Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
      {!loading && vehicleId && !selectedVehicle && !error && <Alert severity="warning" sx={{ mt: 3 }}>O veículo informado não foi encontrado. Exibindo a visão geral.</Alert>}
      {loading ? <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box> : !error && <Box mt={3}><FrotaAnalyticsPanel vehicles={vehicles} vehicle={selectedVehicle} /></Box>}
    </Container>
  );
}
