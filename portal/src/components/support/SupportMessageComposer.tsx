import { Loader2, Lock, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface SupportMessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  disabled?: boolean;
  isSubmitting?: boolean;
  placeholder?: string;
  closedMessage?: string;
}

const SupportMessageComposer = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  isSubmitting = false,
  placeholder = "Digite sua mensagem...",
  closedMessage = "Este ticket está fechado e não aceita novas mensagens.",
}: SupportMessageComposerProps) => (
  <div className="space-y-3 rounded-2xl border bg-card p-4">
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={disabled ? closedMessage : placeholder}
      disabled={disabled || isSubmitting}
      rows={4}
      className="resize-none"
    />
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {disabled ? (
          <span className="inline-flex items-center gap-1">
            <Lock className="h-3.5 w-3.5" />
            {closedMessage}
          </span>
        ) : (
          "As respostas ficam registradas no histórico do ticket."
        )}
      </p>
      <Button onClick={() => void onSubmit()} disabled={disabled || isSubmitting || !value.trim()}>
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4" />}
        Enviar
      </Button>
    </div>
  </div>
);

export default SupportMessageComposer;
