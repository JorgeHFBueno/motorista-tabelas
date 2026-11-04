import { firebaseInitError } from "@/lib/firebase";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const FirebaseInitErrorScreen = () => {
  const errorMessage =
    firebaseInitError?.message ??
    "Não foi possível inicializar os serviços do aplicativo.";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-red-400/30 bg-slate-900/90 p-8 shadow-2xl">
        <div className="mb-4 flex items-center gap-3 text-red-300">
          <AlertTriangle className="h-7 w-7" />
          <h1 className="text-2xl font-semibold">Falha ao conectar com o Firebase</h1>
        </div>

        <p className="mb-2 text-slate-300">
          O aplicativo não conseguiu iniciar os serviços necessários para autenticação e dados.
        </p>
        <p className="mb-6 rounded-md bg-slate-800 p-3 font-mono text-sm text-amber-200">
          {errorMessage}
        </p>

        <div className="space-y-3 text-sm text-slate-300">
          <p>
            Verifique as variáveis <code className="text-slate-100">VITE_FIREBASE_*</code> no ambiente e
            reinicie a aplicação.
          </p>
          <p>Se o problema persistir, contate o suporte técnico.</p>
        </div>

        <div className="mt-8">
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    </main>
  );
};

export default FirebaseInitErrorScreen;