export function isCombustivelPath(pathname: string): boolean {
  return pathname === '/combustivel' || pathname.startsWith('/combustivel/');
}

export function isCombustivelAdm1Restricted(pathname: string, isAdm1: boolean): boolean {
  if (!isAdm1) return false;
  return isCombustivelPath(pathname) && pathname !== '/combustivel/novo';
}