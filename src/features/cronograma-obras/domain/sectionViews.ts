export type WorkSectionViewMode = "contracts" | "flat";

export type WorkSectionViews = {
  started: WorkSectionViewMode;
  notStarted: WorkSectionViewMode;
  finished: WorkSectionViewMode;
};

export const DEFAULT_WORK_SECTION_VIEWS: WorkSectionViews = {
  started: "flat",
  notStarted: "contracts",
  finished: "contracts",
};

export const workSectionViewsStorageKey = (uid: string) =>
  `cronoobra.tableViews.v1:${uid}`;

const isViewMode = (value: unknown): value is WorkSectionViewMode =>
  value === "contracts" || value === "flat";

export function parseWorkSectionViews(raw: string | null): WorkSectionViews {
  if (!raw) return DEFAULT_WORK_SECTION_VIEWS;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return DEFAULT_WORK_SECTION_VIEWS;
    const views = value as Partial<Record<keyof WorkSectionViews, unknown>>;
    return {
      started: isViewMode(views.started)
        ? views.started
        : DEFAULT_WORK_SECTION_VIEWS.started,
      notStarted: isViewMode(views.notStarted)
        ? views.notStarted
        : DEFAULT_WORK_SECTION_VIEWS.notStarted,
      finished: isViewMode(views.finished)
        ? views.finished
        : DEFAULT_WORK_SECTION_VIEWS.finished,
    };
  } catch {
    return DEFAULT_WORK_SECTION_VIEWS;
  }
}

export function loadWorkSectionViews(
  uid: string,
  storage: Pick<Storage, "getItem">,
): WorkSectionViews {
  return parseWorkSectionViews(storage.getItem(workSectionViewsStorageKey(uid)));
}

export function persistWorkSectionViews(
  uid: string,
  views: WorkSectionViews,
  storage: Pick<Storage, "setItem">,
) {
  storage.setItem(workSectionViewsStorageKey(uid), JSON.stringify(views));
}
