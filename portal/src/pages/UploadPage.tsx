import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

const UploadPage = () => {

  useEffect(() => {
    toast({
      title: "Selecione uma obra",
      description: "Selecione uma obra para enviar arquivos.",
    });
  }, []);

    return <Navigate to="/painel/obras" replace />;
};

export default UploadPage;