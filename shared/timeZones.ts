export const TIMEZONE_PICKER_ROW_HEIGHT = 31;
export const TIMEZONE_PICKER_OVERSCAN = 3;

export type TimezoneDiscovery = (key: "timeZone") => string[];

export function getAvailableIanaTimezones(discovery: TimezoneDiscovery | undefined = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf as unknown as TimezoneDiscovery : undefined): string[] {
  const supported = discovery ? discovery("timeZone") : [];
  return ["UTC", ...supported.filter(zone => zone !== "UTC")];
}

export function filterIanaTimezones(timezones: string[], search: string): string[] {
  const normalized = search.trim().toLowerCase();
  return normalized ? timezones.filter(zone => zone.toLowerCase().includes(normalized)) : timezones;
}

export function getTimezoneWindow<T>(items: T[], scrollTop: number, viewportHeight: number, rowHeight = TIMEZONE_PICKER_ROW_HEIGHT, overscan = TIMEZONE_PICKER_OVERSCAN) {
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const visibleEnd = Math.min(items.length, visibleStart + visibleCount);
  return { start: visibleStart, items: items.slice(visibleStart, visibleEnd) };
}

export function formatCorrectedZoneTime(epochMs: number, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "medium" }).format(new Date(epochMs));
}
