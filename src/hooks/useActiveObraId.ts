import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useObra } from "@/contexts/ObraContext";

export const useActiveObraId = () => {
  const { userDoc } = useAuth();
  const { obraAtivaId, setObraAtivaId } = useObra();
  const location = useLocation();
  const navigate = useNavigate();
  const { obraId } = useParams();

  const isClientArea = location.pathname.startsWith("/cliente/");

  const derivedClientObraId = useMemo(() => userDoc?.obras?.[0] ?? null, [userDoc?.obras]);

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
    if (isClientArea && userDoc?.role === "cliente" && !derivedClientObraId) {
      navigate("/cliente/obra", { replace: true });
    }
  }, [derivedClientObraId, isClientArea, navigate, userDoc?.role]);

  return {
    activeObraId: obraId ?? (isClientArea ? derivedClientObraId : obraAtivaId),
    hasClientObra: !!derivedClientObraId,
  };
};