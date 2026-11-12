import { describe, expect, it } from "vitest";
import { FIRST_SNAPSHOT, startupTimings } from "../src/lib/startupTimings";

function fakePerformance(entries: Record<string, object[]>, named: Record<string, object[]> = {}) {
  return {
    getEntriesByType: (type: string) => entries[type] ?? [],
    getEntriesByName: (name: string) => named[name] ?? [],
  } as unknown as Performance;
}

describe("startupTimings", () => {
  it("reports the page, each file and the first snapshot in whole ms", () => {
    const perf = fakePerformance(
      {
        navigation: [{ requestStart: 10.4, responseEnd: 120.6, domContentLoadedEventEnd: 480.2 }],
        resource: [
          {
            name: "https://host/app/assets/index-abc.js",
            startTime: 130.2,
            responseEnd: 400.7,
            transferSize: 95_000,
          },
          {
            name: "https://host/app/assets/rootGateway-x.js",
            startTime: 500,
            responseEnd: 650,
            transferSize: 0,
          },
        ],
      },
      { [FIRST_SNAPSHOT]: [{ startTime: 1234.5 }] },
    );
    expect(startupTimings(perf)).toEqual({
      origin: location.origin,
      page: { start: 10, end: 121 },
      domReady: 480,
      firstSnapshot: 1235,
      files: [
        { file: "index-abc.js", start: 130, end: 401, kB: 93 },
        { file: "rootGateway-x.js", start: 500, end: 650, kB: 0 },
      ],
    });
  });

  it("leaves out what the browser didn't record", () => {
    expect(startupTimings(fakePerformance({}))).toEqual({
      origin: location.origin,
      page: { start: null, end: null },
      domReady: null,
      firstSnapshot: null,
      files: [],
    });
  });
});
