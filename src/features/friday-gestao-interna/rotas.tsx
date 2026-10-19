import { useCallback } from 'react';
import {
  Link as RRLink, NavLink as RRNavLink, Navigate as RRNavigate, useLocation as useRRLocation, useNavigate as useRRNavigate,
  type LinkProps, type NavigateOptions, type NavigateProps, type NavLinkProps, type To,
} from 'react-router-dom';

// O Friday vive em /friday dentro do sistema. As telas continuam usando caminhos do próprio app
// ("/", "/quadros/12"): estes invólucros acrescentam e retiram o prefixo, no lugar do react-router-dom.
export const BASE = '/friday';

export function comBase(to: To): To {
  if (typeof to === 'string') return to.startsWith('/') ? `${BASE}${to === '/' ? '' : to}` : to;
  return to.pathname?.startsWith('/') ? { ...to, pathname: comBase(to.pathname) as string } : to;
}

export function useNavigate() {
  const navigate = useRRNavigate();
  return useCallback((to: To | number, opcoes?: NavigateOptions) => {
    if (typeof to === 'number') navigate(to);
    else navigate(comBase(to), opcoes);
  }, [navigate]);
}

// pathname sem o prefixo (ex.: "/quadros/12").
export function useLocation() {
  const local = useRRLocation();
  const pathname = local.pathname.startsWith(BASE) ? local.pathname.slice(BASE.length) || '/' : local.pathname;
  return { ...local, pathname };
}

export const Link = ({ to, ...resto }: LinkProps) => <RRLink to={comBase(to)} {...resto} />;
export const NavLink = ({ to, ...resto }: NavLinkProps) => <RRNavLink to={comBase(to)} {...resto} />;
export const Navigate = ({ to, ...resto }: NavigateProps) => <RRNavigate to={comBase(to)} {...resto} />;
