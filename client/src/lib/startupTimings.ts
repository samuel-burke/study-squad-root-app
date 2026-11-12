/** Marked when the first room snapshot arrives from the server. */
export const FIRST_SNAPSHOT = "studysquad:first-snapshot";

const ms = (n: number | undefined) => (n === undefined ? null : Math.round(n));

/**
 * How this cold start went, in ms since the app was opened, for the self-test
 * report: when the page and each of its files arrived (kB is what came over
 * the network, 0 for a local or cached file) and when the first room data came.
 */
export function startupTimings(perf: Performance = performance) {
  const nav = perf.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const files = perf.getEntriesByType("resource") as PerformanceResourceTiming[];
  return {
    origin: location.origin,
    page: { start: ms(nav?.requestStart), end: ms(nav?.responseEnd) },
    domReady: ms(nav?.domContentLoadedEventEnd),
    firstSnapshot: ms(perf.getEntriesByName(FIRST_SNAPSHOT)[0]?.startTime),
    files: files.map((f) => ({
      file: f.name.split("/").pop(),
      start: ms(f.startTime),
      end: ms(f.responseEnd),
      kB: Math.round(f.transferSize / 1024),
    })),
  };
}
