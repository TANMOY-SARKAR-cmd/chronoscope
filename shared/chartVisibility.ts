export type SeriesVisibility = Record<string, boolean>;

export function reconcileSeriesVisibility(current: SeriesVisibility, availableKeys: string[]): SeriesVisibility {
  return Object.fromEntries(availableKeys.map(key => [key, current[key] ?? true]));
}
