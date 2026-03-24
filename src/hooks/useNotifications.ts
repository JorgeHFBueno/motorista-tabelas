import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { AppNotification } from "@/types/notifications";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from "@/services/notifications/notifications.service";

const isDev = import.meta.env.DEV;

const logNotificationsDebug = (message: string, payload?: Record<string, unknown>) => {
  if (!isDev) return;
  console.info(`[NOTIFICATIONS_HOOK] ${message}`, payload ?? {});
};

export const useNotifications = (limitCount = 20) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeToNotifications(
      user.uid,
      (nextNotifications) => {
        setNotifications(nextNotifications);
        setIsLoading(false);
      },
      limitCount,
    );

    return () => {
      unsubscribe();
    };
  }, [limitCount, user?.uid]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.lida).length,
    [notifications],
  );

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      if (!user?.uid) return;
      try {
        await markNotificationAsRead(user.uid, notificationId);
      } catch (err) {
        setError("Não foi possível marcar a notificação como lida.");
        logNotificationsDebug("erro ao marcar como lida", { notificationId, err });
      }
    },
    [user?.uid],
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!user?.uid || isMarkingAll) return;

    setIsMarkingAll(true);
    try {
      await markAllNotificationsAsRead(user.uid);
    } catch (err) {
      setError("Não foi possível marcar todas as notificações como lidas.");
      logNotificationsDebug("erro ao marcar todas como lidas", { err });
    } finally {
      setIsMarkingAll(false);
    }
  }, [isMarkingAll, user?.uid]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    isMarkingAll,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
  };
};