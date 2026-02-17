import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  AuthError,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { auth, db } from "@/lib/firebase";

const authSchema = z.object({
  email: z.string().min(1, "E-mail é obrigatório").email("Informe um e-mail válido"),
  senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
});

type AuthFormData = z.infer<typeof authSchema>;

type AuthMode = "login" | "register";

const firebaseErrorMap: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha inválidos.",
  "auth/email-already-in-use": "Este e-mail já está em uso.",
  "auth/weak-password": "A senha é muito fraca. Use pelo menos 6 caracteres.",
};

const LoginPage = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      senha: "",
    },
  });

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const getFriendlyError = (error: unknown) => {
    const authError = error as AuthError;
    return firebaseErrorMap[authError.code] ?? "Não foi possível autenticar. Tente novamente.";
  };

  const onSubmit = async ({ email, senha }: AuthFormData) => {
    setFormError(null);

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, senha);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const uid = userCredential.user?.uid;

        if (uid) {
          await setDoc(
            doc(db, "clientes", uid),
            {
              uid,
              email,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              status: "ativo",
              role: "cliente",
            },
            { merge: true },
          );
        }
      }

      navigate("/", { replace: true });
    } catch (error) {
      setFormError(getFriendlyError(error));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === "login" ? "Entrar" : "Criar conta"}</CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Acesse sua conta para visualizar o dashboard."
              : "Crie sua conta para acessar o portal do cliente."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={mode === "login" ? "default" : "outline"} onClick={() => setMode("login")}>
              Entrar
            </Button>
            <Button variant={mode === "register" ? "default" : "outline"} onClick={() => setMode("register")}>
              Criar conta
            </Button>
          </div>

          <Separator />

          {formError && (
            <Alert variant="destructive">
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;