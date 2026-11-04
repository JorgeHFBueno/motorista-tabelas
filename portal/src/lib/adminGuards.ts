import { toast } from "@/hooks/use-toast";

export const warnIfNotAdmin = (isAdmin: boolean) => {
  if (isAdmin) return true;

  const message = "Seu usuário atual não é admin. A ação pode retornar permissão negada.";
  console.warn(`[painel-cadastros] ${message}`);
  toast({
    title: "Atenção",
    description: message,
    variant: "destructive",
  });

  return false;
};