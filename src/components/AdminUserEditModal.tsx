import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { loginDoUsuario, nomeDoUsuario, type AdminUser } from '../services/adminUsersApi';
import { CREDENCIAIS, CREDENCIAIS_SO_ADM2, semCredenciais, type Credencial, type Credenciais } from '../services/credenciais';
import { useAuth } from '../contexts/AuthContext';

export type AdminUserEditValues = { ativo: boolean; credenciais: Credenciais };
// completo: every piece of data plus situation and credentials (the name or Ações → Editar); credenciais: only the boxes
// (the Credenciais cell); situacao: only activate/deactivate (the Situação cell).
export type ModoEdicaoUsuario = 'completo' | 'credenciais' | 'situacao';

interface AdminUserEditModalProps {
  open: boolean;
  user: AdminUser | null;
  modo: ModoEdicaoUsuario;
  onClose: () => void;
  onSave: (values: AdminUserEditValues) => Promise<void>;
  saving: boolean;
  submitError: string | null;
  dateFormatter: Intl.DateTimeFormat;
}

const Dado = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary">{rotulo}</Typography>
    <Typography variant="body2" component="div" sx={{ overflowWrap: 'anywhere' }}>{children}</Typography>
  </Stack>
);

// Name and login are not edited here: each person changes their own in Meu perfil.
export default function AdminUserEditModal({ open, user, modo, onClose, onSave, saving, submitError, dateFormatter }: AdminUserEditModalProps) {
  const [ativo, setAtivo] = useState(true);
  const [credenciais, setCredenciais] = useState<Credenciais>(semCredenciais());
  const souAdm2 = useAuth().authorizationProfile?.adm2 === true;

  useEffect(() => {
    setAtivo(user?.funcionario?.ativo ?? true);
    setCredenciais(user?.funcionario?.credenciais ?? semCredenciais());
  }, [user]);

  const nome = user ? nomeDoUsuario(user) : '';
  const nenhuma = !Object.values(credenciais).some(Boolean);
  const data = (valor: string | null | undefined) => {
    const d = valor ? new Date(valor) : null;
    return d && !Number.isNaN(d.getTime()) ? dateFormatter.format(d) : '—';
  };
  const atual = user?.funcionario?.ativo === true;

  if (modo === 'situacao') {
    // Confirms the opposite of the current situation; the credentials stay as they are.
    return (
      <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
        <DialogTitle>{atual ? `Desativar ${nome}?` : `Ativar ${nome}?`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {submitError && <Alert severity="error">{submitError}</Alert>}
            <Typography>
              {atual
                ? 'A pessoa deixa de entrar no app, na WEB e no Kiosk. As credenciais e o histórico ficam guardados para quando ela voltar.'
                : 'A pessoa volta a entrar no app e na WEB com as credenciais que já tem.'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="contained" color={atual ? 'error' : 'success'} disabled={saving}
            onClick={() => void onSave({ ativo: !atual, credenciais: user?.funcionario?.credenciais ?? semCredenciais() })}>
            {atual ? 'Desativar' : 'Ativar'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  const caixas = (
    <div>
      {modo === 'completo' && <FormLabel component="legend">Credenciais</FormLabel>}
      <FormGroup>
        {CREDENCIAIS.map((c) => (
          <FormControlLabel
            key={c.chave}
            control={<Checkbox checked={credenciais[c.chave] === true} disabled={!souAdm2 && CREDENCIAIS_SO_ADM2.includes(c.chave)} onChange={(e) => setCredenciais((prev) => ({ ...prev, [c.chave as Credencial]: e.target.checked }))} />}
            label={<><strong>{c.rotulo}</strong> — {c.descricao}</>}
          />
        ))}
      </FormGroup>
    </div>
  );

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{modo === 'credenciais' ? `Credenciais de ${nome}` : nome}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {submitError && <Alert severity="error">{submitError}</Alert>}
          {modo === 'completo' && user && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3, rowGap: 1.5 }}>
                <Dado rotulo="Nome">{nome}</Dado>
                <Dado rotulo="Login">{loginDoUsuario(user)}</Dado>
                {/* The registry e-mail only when it differs from the login (for a phone login it is the same account). */}
                {user.funcionario?.email && user.funcionario.email !== user.email && <Dado rotulo="E-mail do cadastro">{user.funcionario.email}</Dado>}
                <Dado rotulo="Situação">
                  <FormControlLabel sx={{ my: -0.75, ml: -0.75 }} control={<Switch size="small" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />} label={ativo ? 'Ativo' : 'Inativo'} />
                  {user.disabled && atual && <Typography variant="caption" color="warning.main" component="div">bloqueada no login</Typography>}
                </Dado>
                <Dado rotulo="Conta criada em">{data(user.createdAt)}</Dado>
                <Dado rotulo="Último acesso">{data(user.funcionario?.ultimoAcesso ?? user.lastLoginAt)}</Dado>
                <Box sx={{ gridColumn: '1 / -1' }}><Dado rotulo="UID"><Box component="span" sx={{ fontFamily: 'monospace', fontSize: 12 }}>{user.uid}</Box></Dado></Box>
              </Box>
              <Typography variant="caption" color="text.secondary">Nome e login são trocados pela própria pessoa, no Meu perfil.</Typography>
              <Divider />
            </>
          )}
          {caixas}
          {nenhuma && <Alert severity="warning">Sem nenhuma credencial, a pessoa não entra no app nem na WEB.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button variant="contained" onClick={() => void onSave({ ativo: modo === 'completo' ? ativo : atual, credenciais })} disabled={saving}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
}
