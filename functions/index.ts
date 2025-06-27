import { onRequest } from 'firebase-functions/v2/https';
import app from './api.js';

export const api = onRequest(app);