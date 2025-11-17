import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Box, Tabs, Tab, Typography, Container } from '@mui/material';
import { useSearchParams } from 'react-router-dom';

type TabKey = 'geral' | 'graficos' | 'hibrido';
const TAB_KEYS: TabKey[] = ['geral', 'graficos', 'hibrido'];
const DEFAULT_TAB: TabKey = 'geral';

function a11yProps(tab: TabKey) {
  return {
    id: `frota-tab-${tab}`,
    'aria-controls': `frota-tabpanel-${tab}`,
  } as const;
}

function getValidTab(tabParam: string | null): TabKey {
  if (tabParam && TAB_KEYS.includes(tabParam as TabKey)) {
    return tabParam as TabKey;
  }
  return DEFAULT_TAB;
}

function TabPanel({
  children,
  value,
  tabKey,
}: {
  children: ReactNode;
  value: TabKey;
  tabKey: TabKey;
}) {
  return (
    <div
      role="tabpanel"
      hidden={value !== tabKey}
      id={`frota-tabpanel-${tabKey}`}
      aria-labelledby={`frota-tab-${tabKey}`}
    >
      {value === tabKey && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Frota() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() =>
    getValidTab(searchParams.get('tab')),
  );

  useEffect(() => {
    const currentTab = getValidTab(searchParams.get('tab'));
    setTab(currentTab);
  }, [searchParams]);

  const handleTabChange = (_event: SyntheticEvent, newValue: TabKey) => {
    const newTab = getValidTab(newValue);
    setTab(newTab);
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('tab', newTab);
      return params;
    }, { replace: true });
  };

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        Frota
      </Typography>

      <Tabs
        value={tab}
        onChange={handleTabChange}
        aria-label="Abas da frota"
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab label="Geral" value="geral" {...a11yProps('geral')} />
        <Tab label="Gráficos" value="graficos" {...a11yProps('graficos')} />
        <Tab label="Híbrido" value="hibrido" {...a11yProps('hibrido')} />
      </Tabs>

      <TabPanel value={tab} tabKey="geral">
        <Typography>Seção: Geral</Typography>
      </TabPanel>
      <TabPanel value={tab} tabKey="graficos">
        <Typography>Seção: Gráficos</Typography>
      </TabPanel>
      <TabPanel value={tab} tabKey="hibrido">
        <Typography>Seção: Híbrido</Typography>
      </TabPanel>
    </Container>
  );
}