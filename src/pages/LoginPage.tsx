import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthError } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

const loginSchema = z.object({
  email: z.string().min(1, "E-mail é obrigatório").email("Informe um e-mail válido"),
  senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const errorMap: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha inválidos.",
  "auth/user-not-found": "Usuário não encontrado.",
  "auth/wrong-password": "Senha incorreta.",
  "auth/email-already-in-use": "Este e-mail já está em uso.",
  "auth/weak-password": "A senha é muito fraca. Use pelo menos 6 caracteres.",
};

const LoginPage = () => {
  const navigate = useNavigate();
  const { user, loading, login, signup } = useAuth();
  const [authAction, setAuthAction] = useState<"login" | "signup" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      senha: "",
    },
  });

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const getFriendlyMessage = (error: unknown) => {
    const authError = error as AuthError;
    return errorMap[authError.code] ?? "Não foi possível autenticar no momento. Tente novamente.";
  };

  const submitWithAction = async (values: LoginFormValues, action: "login" | "signup") => {
    setErrorMessage(null);
    setAuthAction(action);

    try {
      if (action === "login") {
        await login(values.email, values.senha);
      } else {
        await signup(values.email, values.senha);
      }

      navigate("/", { replace: true });
    } catch (error) {
      setErrorMessage(getFriendlyMessage(error));
    } finally {
      setAuthAction(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Acesso do cliente</CardTitle>
          <CardDescription>Entre com seu e-mail e senha ou crie uma nova conta.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertTitle>Falha ao autenticar</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" placeholder="voce@email.com" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" placeholder="******" {...register("senha")} />
              {errors.senha && <p className="text-sm text-destructive">{errors.senha.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                disabled={isSubmitting || !!authAction}
                onClick={handleSubmit((values) => submitWithAction(values, "login"))}
              >
                {authAction === "login" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting || !!authAction}
                onClick={handleSubmit((values) => submitWithAction(values, "signup"))}
              >
                {authAction === "signup" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar conta
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;