import { nextOccurrence, type AppConfig, type Logger } from "@studyroom/core";

export const RECAP_TAG = "daily-recap";
/** A recap that fires this late is still worth posting. Later than this, skip to tomorrow. */
const MISSED_GRACE_MS = 2 * 60 * 60 * 1000;

/** The slice of Root's JobScheduler the recap needs. */
export interface JobsPort {
  scheduleOnce(tag: string, at: Date): Promise<void>;
  cancelByTag(tag: string): Promise<void>;
  /**
   * Root's SDK types jobTime as a Date, but on SQLite it arrives as epoch
   * milliseconds (a number), so accept anything Date() can read.
   */
  onJob(
    handler: (job: {
      tag?: string | null;
      jobTime: Date | number | string;
      missed: boolean;
    }) => void,
  ): void;
}

export interface RecapTarget {
  getConfig(): AppConfig;
  postDailyRecap(): Promise<boolean>;
}

/**
 * Keeps exactly one one-time job queued for the next recap. One-time jobs
 * (rescheduled after each run) stay correct across daylight saving changes,
 * which a fixed 24-hour interval would not.
 */
export class RecapScheduler {
  constructor(
    private readonly jobs: JobsPort,
    private readonly target: RecapTarget,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  async start(): Promise<void> {
    this.jobs.onJob((job) => {
      if (job.tag !== RECAP_TAG) return;
      // Never throw here: this runs inside the SDK's job loop, and a throw
      // stops the job from being marked done, so it re-fires (and fails)
      // every minute instead of ever posting.
      const at = new Date(job.jobTime).getTime();
      const late = Number.isFinite(at) ? this.now() - at : 0;
      void this.fire(job.missed && late > MISSED_GRACE_MS);
    });
    // The recap is a nice-to-have: if Root's job scheduler is unavailable,
    // log it and let the app start. The next settings change retries.
    try {
      await this.reschedule();
    } catch (error) {
      this.logger.error("recap schedule failed", { error: String(error) });
    }
  }

  async reschedule(): Promise<void> {
    await this.jobs.cancelByTag(RECAP_TAG);
    const config = this.target.getConfig();
    if (!config.recap.enabled || !config.postChannelId) return;
    const at = nextOccurrence(
      this.now(),
      config.recap.hours,
      config.recap.minutes,
      config.timeZone,
    );
    await this.jobs.scheduleOnce(RECAP_TAG, new Date(at));
  }

  private async fire(skip: boolean): Promise<void> {
    try {
      if (!skip) await this.target.postDailyRecap();
    } catch (error) {
      this.logger.error("daily recap failed", { error: String(error) });
    }
    try {
      await this.reschedule();
    } catch (error) {
      this.logger.error("recap reschedule failed", { error: String(error) });
    }
  }
}
