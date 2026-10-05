import { getAuth, type User } from 'firebase/auth';

export const MONDAY_OAUTH_START_ENDPOINT = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayOAuthStart';

export class MondayOAuthStartError extends Error {
  constructor() {
    super('Não foi possível iniciar a autorização do Monday.');
    this.name = 'MondayOAuthStartError';
  }
}

type Dependencies = {
  currentUser?: User | null;
  fetch?: typeof fetch;
  assign?: (url: string) => void;
};

export async function startMondayOAuth(dependencies: Dependencies = {}): Promise<string> {
  const user = dependencies.currentUser === undefined ? getAuth().currentUser : dependencies.currentUser;
  const request = dependencies.fetch ?? fetch;
  const assign = dependencies.assign ?? ((url: string) => window.location.assign(url));

  if (!user) throw new MondayOAuthStartError();

  try {
    const token = await user.getIdToken();
    const response = await request(MONDAY_OAUTH_START_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const result = await response.json().catch(() => ({})) as { authorizationUrl?: unknown };
    if (!response.ok || typeof result.authorizationUrl !== 'string' || !result.authorizationUrl) throw new MondayOAuthStartError();
    assign(result.authorizationUrl);
    return result.authorizationUrl;
  } catch (cause) {
    if (cause instanceof MondayOAuthStartError) throw cause;
    throw new MondayOAuthStartError();
  }
}
