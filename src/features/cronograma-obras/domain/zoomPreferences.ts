import type { ZoomCronograma } from "./models";

export type PersistedTimelineZoom = "day" | "week";
export const zoomStorageKey = (uid: string) => `cronoobra.zoom.v1:${uid}`;

export function parsePersistedTimelineZoom(raw: string | null, fallback: PersistedTimelineZoom): PersistedTimelineZoom {
  return raw === "day" || raw === "week" ? raw : fallback;
}

export function loadTimelineZoom(uid: string, storage: Pick<Storage, "getItem">, fallback: PersistedTimelineZoom): PersistedTimelineZoom {
  return parsePersistedTimelineZoom(storage.getItem(zoomStorageKey(uid)), fallback);
}

export function persistTimelineZoom(uid: string, zoom: ZoomCronograma, storage: Pick<Storage, "setItem">): void {
  if (zoom === "day" || zoom === "week") storage.setItem(zoomStorageKey(uid), zoom);
}
