import { describe, expect, it, vi } from "vitest";
import { RECAP_TAG, RecapScheduler, type JobsPort } from "../src/jobs/recapScheduler";
import { configWith, T0 } from "../../core/test/helpers";

function setup(config = configWith(), now = T0) {
  let handler: Parameters<JobsPort["onJob"]>[0] = () => {};
  const scheduled: { tag: string; at: Date }[] = [];
  const jobs: JobsPort = {
    scheduleOnce: vi.fn(async (tag, at) => {
      scheduled.push({ tag, at });
    }),
    cancelByTag: vi.fn(async () => {
      scheduled.length = 0;
    }),
    onJob: (h) => {
      handler = h;
    },
  };
  const target = { getConfig: vi.fn(() => config), postDailyRecap: vi.fn(async () => true) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let clock = now;
  const scheduler = new RecapScheduler(jobs, target, logger, () => clock);
  return {
    scheduler,
    jobs,
    target,
    logger,
    scheduled,
    fire: (job: Parameters<typeof handler>[0]) => handler(job),
    setNow: (t: number) => {
      clock = t;
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("RecapScheduler", () => {
  it("queues one job for the next recap time in the community zone", async () => {
    const { scheduler, scheduled } = setup();
    await scheduler.start();
    // T0 is 10 AM in New York; 9 PM EDT is 01:00 UTC the next day.
    expect(scheduled).toEqual([{ tag: RECAP_TAG, at: new Date(Date.UTC(2026, 9, 29, 1, 0)) }]);
  });

  it("schedules nothing when recaps are off or there's no channel", async () => {
    for (const config of [
      configWith({ recap: { enabled: false, hours: 21, minutes: 0 } }),
      configWith({ postChannelId: null }),
    ]) {
      const { scheduler, scheduled } = setup(config);
      await scheduler.start();
      expect(scheduled).toEqual([]);
    }
  });

  it("posts when the job fires, then queues tomorrow", async () => {
    const { scheduler, target, scheduled, fire, setNow } = setup();
    await scheduler.start();
    const at = scheduled[0]!.at;
    setNow(at.getTime());
    fire({ tag: RECAP_TAG, jobTime: at, missed: false });
    await flush();
    expect(target.postDailyRecap).toHaveBeenCalledTimes(1);
    expect(scheduled[0]!.at.getTime()).toBe(at.getTime() + 24 * 60 * 60 * 1000);
  });

  it("posts when Root hands the job time over as epoch milliseconds", async () => {
    // Root's scheduler reads job_time back from SQLite as a number, not a Date.
    const { scheduler, target, scheduled, fire, setNow } = setup();
    await scheduler.start();
    const at = scheduled[0]!.at;
    setNow(at.getTime());
    expect(() => fire({ tag: RECAP_TAG, jobTime: at.getTime(), missed: false })).not.toThrow();
    await flush();
    expect(target.postDailyRecap).toHaveBeenCalledTimes(1);
  });

  it("still skips a recap missed by hours when the time is a number", async () => {
    const { scheduler, target, scheduled, fire, setNow } = setup();
    await scheduler.start();
    const at = scheduled[0]!.at;
    setNow(at.getTime() + 3 * 60 * 60 * 1000);
    fire({ tag: RECAP_TAG, jobTime: at.getTime(), missed: true });
    await flush();
    expect(target.postDailyRecap).not.toHaveBeenCalled();
  });

  it("ignores other jobs and skips recaps missed by hours", async () => {
    const { scheduler, target, scheduled, fire, setNow } = setup();
    await scheduler.start();
    fire({ tag: "something-else", jobTime: new Date(T0), missed: false });
    const at = scheduled[0]!.at;
    setNow(at.getTime() + 5 * 60 * 60 * 1000);
    fire({ tag: RECAP_TAG, jobTime: at, missed: true });
    await flush();
    expect(target.postDailyRecap).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
  });

  it("still reschedules when posting fails", async () => {
    const { scheduler, target, scheduled, fire, logger } = setup();
    target.postDailyRecap.mockRejectedValueOnce(new Error("Root API down"));
    await scheduler.start();
    fire({ tag: RECAP_TAG, jobTime: scheduled[0]!.at, missed: false });
    await flush();
    expect(logger.error).toHaveBeenCalledWith("daily recap failed", expect.anything());
    expect(scheduled).toHaveLength(1);
  });

  it("still starts, and logs, when Root's job scheduler is unavailable", async () => {
    const { scheduler, jobs, logger, fire, target } = setup();
    vi.mocked(jobs.cancelByTag).mockRejectedValueOnce(new Error("jobs offline"));
    await expect(scheduler.start()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("recap schedule failed", {
      error: "Error: jobs offline",
    });
    // The job listener is still registered, so a later job still posts.
    fire({ tag: RECAP_TAG, jobTime: new Date(T0), missed: false });
    await flush();
    expect(target.postDailyRecap).toHaveBeenCalledTimes(1);
  });
});
