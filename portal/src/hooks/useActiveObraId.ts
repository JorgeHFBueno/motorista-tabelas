import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useObra } from "@/contexts/ObraContext";

export const useActiveObraId = () => {
  const { user, userDoc, loading, authReady, userDocReady } = useAuth();
  const { obraAtivaId, setObraAtivaId } = useObra();
  const location = useLocation();
  const navigate = useNavigate();
  const { obraId } = useParams();
  const isDev = import.meta.env.DEV;

  const isClientArea = location.pathname === "/cliente" || location.pathname.startsWith("/cliente/");

  const derivedClientObraId = useMemo(() => userDoc?.obras?.[0] ?? null, [userDoc?.obras]);
  const isResolvingAuth = loading || !authReady;
  const isResolvingUserDoc = Boolean(user) && (!userDocReady || (userDoc === null && loading));
  const isResolvingClientObra = isClientArea && userDoc?.role === "cliente" && !userDocReady;
  const resolvedActiveObraId = obraId ?? (isClientArea ? derivedClientObraId : obraAtivaId);
  const hasClientObra = derivedClientObraId !== null;

  useEffect(() => {
    if (!isDev) return;

    console.info("[useActiveObraId] resolução", {
      pathname: location.pathname,
      isClientArea,
      authLoading: loading,
      authReady,
      userUid: user?.uid ?? null,
      userDocReady,
      userRole: userDoc?.role ?? null,
      userObras: userDoc?.obras ?? null,
      derivedClientObraId,
      routeObraId: obraId ?? null,
      obraAtivaId,
      resolvedActiveObraId,
      hasClientObra,
      isResolvingAuth,
      isResolvingUserDoc,
      isResolvingClientObra,
    });
  }, [authReady, derivedClientObraId, hasClientObra, isClientArea, isDev, isResolvingAuth, isResolvingClientObra, isResolvingUserDoc, loading, location.pathname, obraAtivaId, obraId, resolvedActiveObraId, user?.uid, userDoc?.obras, userDoc?.role, userDocReady]);

  useEffect(() => {
    if (obraId && obraId !== obraAtivaId) {
      setObraAtivaId(obraId);
    }
  }, [obraAtivaId, obraId, setObraAtivaId]);

  useEffect(() => {
    if (isClientArea && derivedClientObraId && obraAtivaId !== derivedClientObraId) {
      setObraAtivaId(derivedClientObraId);
    }
  }, [derivedClientObraId, isClientArea, obraAtivaId, setObraAtivaId]);

  useEffect(() => {
    if (isClientArea && userDocReady && userDoc?.role === "cliente" && !derivedClientObraId) {
      navigate("/cliente/sem-obra", { replace: true });
    }
  }, [derivedClientObraId, isClientArea, navigate, userDoc?.role, userDocReady]);

  return {
    activeObraId: resolvedActiveObraId,
    hasClientObra,
    isResolvingAuth,
    isResolvingUserDoc,
    isResolvingClientObra,
    isReady: !isResolvingAuth && !isResolvingUserDoc && !isResolvingClientObra,
  };
};