const ADM1_ALLOWED_PATHS = ['/', '/combustivel/novo'] as const;

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function isAdm1RouteRestricted(pathname: string, isAdm1: boolean): boolean {
  if (!isAdm1) {
    return false;
  }

  const normalizedPathname = normalizePathname(pathname);
  return !ADM1_ALLOWED_PATHS.includes(normalizedPathname as (typeof ADM1_ALLOWED_PATHS)[number]);
}