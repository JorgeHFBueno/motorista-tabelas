import { GoogleAuth } from 'google-auth-library';
import { defineSecret } from 'firebase-functions/params';

export const MONDAY_REFRESH_TOKEN_SECRET = 'MONDAY_WEBHOOK_REFRESH_TOKEN';
export const mondayRefreshTokenSecret = defineSecret(MONDAY_REFRESH_TOKEN_SECRET);

export interface MondayRefreshTokenStore {
  read(): Promise<string>;
  writeRotated(refreshToken: string): Promise<void>;
}

const projectId = () => {
  const config = process.env.FIREBASE_CONFIG?.trim();
  if (config) {
    try { return JSON.parse(config).projectId as string | undefined; } catch { /* use env */ }
  }
  return process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
};

async function accessToken(): Promise<string> {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('SECRET_MANAGER_AUTH_UNAVAILABLE');
  return token.token;
}

function resourceName() {
  const project = projectId();
  if (!project) throw new Error('SECRET_MANAGER_PROJECT_UNAVAILABLE');
  return `projects/${project}/secrets/${MONDAY_REFRESH_TOKEN_SECRET}`;
}

export class GoogleSecretManagerTokenStore implements MondayRefreshTokenStore {
  async read(): Promise<string> {
    const response = await fetch(`https://secretmanager.googleapis.com/v1/${resourceName()}/versions/latest:access`, {
      headers: { Authorization: `Bearer ${await accessToken()}` },
    });
    if (!response.ok) throw new Error('SECRET_MANAGER_READ_FAILED');
    const body = await response.json() as { payload?: { data?: string } };
    const value = body.payload?.data ? Buffer.from(body.payload.data, 'base64').toString('utf8') : '';
    if (!value) throw new Error('REFRESH_TOKEN_UNAVAILABLE');
    return value;
  }

  async writeRotated(refreshToken: string): Promise<void> {
    if (!refreshToken) throw new Error('REFRESH_TOKEN_EMPTY');
    const response = await fetch(`https://secretmanager.googleapis.com/v1/${resourceName()}:addVersion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { data: Buffer.from(refreshToken, 'utf8').toString('base64') } }),
    });
    if (!response.ok) throw new Error('SECRET_MANAGER_WRITE_FAILED');
  }
}

export class InMemoryMondayRefreshTokenStore implements MondayRefreshTokenStore {
  constructor(private value = '') {}
  async read() { if (!this.value) throw new Error('REFRESH_TOKEN_UNAVAILABLE'); return this.value; }
  async writeRotated(refreshToken: string) { if (!refreshToken) throw new Error('REFRESH_TOKEN_EMPTY'); this.value = refreshToken; }
  current() { return this.value; }
}
