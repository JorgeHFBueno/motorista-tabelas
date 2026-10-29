import { onRequest } from 'firebase-functions/v2/https';
import app from './api.js';
import './firebaseAdmin.js';
import adminApp from './adminApi.js';
export { getKioskCredentialStatus, provisionKioskCredential, revokeKioskQr, setKioskPin, setKioskPinEnabled } from './kiosk/kioskAdmin.js';
export { kioskAuthenticatePin, kioskAuthenticateQr } from './kiosk/kioskAuth.js';
export { kioskSessionEvent } from './kiosk/kioskSession.js';
export { provisionKioskAdminPin } from './kiosk/kioskAdminPin.js';
export { getVehicleErpCosts } from './vehicleReport.js';
export { syncMondaySerpMeasurements } from './mondaySerpMeasurements.js';
export { fridayMondayInventario, fridayMondayImportarQuadro } from './fridayMondayImport.js';
export { fridayCadastroCampos, fridayCadastroGravar, fridayCadastroPromover } from './fridayCadastros.js';
export { fridayObrasSituacaoItem, fridayObrasSituacaoDiaria } from './fridayObrasSituacao.js';
export { fridayAutomacoesEvento, fridayAutomacoesDatas } from './fridayAutomacoes.js';
export { atualizarMeuPerfil } from './meuPerfil.js';
export { manuscriptListTree, manuscriptGetDocument, manuscriptSearch, manuscriptGetBacklinks, manuscriptGetDocumentGraph, manuscriptGetDocumentHistory } from './manuscript.js';

export const api = onRequest(app);
export const adminApi = onRequest(adminApp);
