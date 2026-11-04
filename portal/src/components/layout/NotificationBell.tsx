import { Bell, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";

interface NotificationBellProps {
  className?: string;
}

const formatNotificationDate = (value?: { toDate?: () => Date; seconds?: number }) => {
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleString("pt-BR");
  }

  return "Agora";
};

const NotificationBell = ({ className }: NotificationBellProps) => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    isMarkingAll,
    markAsRead,
    markAllAsRead,
  } = useNotifications(20);

  const badgeText = useMemo(() => {
    if (unreadCount <= 0) return null;
    if (unreadCount > 99) return "99+";
    return String(unreadCount);
  }, [unreadCount]);

  const handleNotificationClick = async (
    notificationId: string,
    route?: string,
  ) => {
    await markAsRead(notificationId);
    if (typeof route === "string" && route.trim()) {
      navigate(route);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative p-2.5 bg-primary-foreground/10 hover:bg-primary-foreground/15 rounded-lg transition-colors",
            className,
          )}
          aria-label="Notificações"
        >
          <Bell className="w-5 h-5" />
          {badgeText ? (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-secondary text-secondary-foreground text-[10px] font-semibold flex items-center justify-center">
              {badgeText}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="p-3 border-b flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Notificações</p>
            <p className="text-xs text-muted-foreground">Atualizações da sua obra</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void markAllAsRead()}
            disabled={isMarkingAll || unreadCount === 0}
          >
            {isMarkingAll ? "Marcando..." : "Marcar todas"}
          </Button>
        </div>

        <ScrollArea className="max-h-[360px]">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando notificações...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhuma notificação.</div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const route =
                  typeof notification.metadata?.rotaDestino === "string"
                    ? notification.metadata.rotaDestino
                    : undefined;

                return (
                  <button
                    key={notification.id}
                    className={cn(
                      "w-full text-left p-3 hover:bg-muted/40 transition-colors",
                      !notification.lida ? "bg-secondary/20" : "opacity-80",
                    )}
                    onClick={() => void handleNotificationClick(notification.id, route)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-5">{notification.titulo}</p>
                      {!notification.lida ? <Badge variant="secondary">Nova</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{notification.mensagem}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatNotificationDate(notification.createdAt)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;