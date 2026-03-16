interface MaybeFirestoreError {
  code?: string;
  message?: string;
}

function toFirestoreError(err: unknown): MaybeFirestoreError {
  if (!err || typeof err !== 'object') {
    return {};
  }

  const candidate = err as Record<string, unknown>;

  return {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  };
}

export function isFirestoreIndexError(err: unknown): boolean {
  const parsed = toFirestoreError(err);
  const code = parsed.code?.toLowerCase() ?? '';
  const message = parsed.message?.toLowerCase() ?? '';

  return (
    code.includes('failed-precondition') ||
    message.includes('requires an index') ||
    message.includes('index')
  );
}

export function toUserFriendlyLoadError(sourceLabel: string, err: unknown): string {
  if (isFirestoreIndexError(err)) {
    return `Falha ao carregar ${sourceLabel}: a consulta ao Firestore exige um índice que ainda não foi criado. Verifique os índices da collection consultada.`;
  }

  const original = err instanceof Error ? err.message : '';
  if (original) {
    return `Falha ao carregar ${sourceLabel}: ${original}`;
  }

  return `Falha ao carregar ${sourceLabel}. Tente novamente.`;
}