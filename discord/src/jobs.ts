import { EventEmitter } from "node:events";
import fs from "node:fs";

/** Root's job event names (JobScheduleEvent in @rootsdk/server-app). */
export const JOB_EVENT = { Job: "job", JobMissed: "job.missed" };

const MISSED_AFTER_MS = 2 * 60_000;

interface Job {
  id: number;
  tag: string;
  resourceId: string;
  start: number;
}

/**
 * Root's one-time job scheduler, kept in a JSON file so jobs (daily recaps,
 * scheduled session reminders) survive a restart. Jobs that came due while
 * the server was down fire as missed, like on Root. A sleeping server is woken
 * for its jobs (guilds.ts), so those fire on time.
 */
export class JobScheduler extends EventEmitter {
  private jobs: Job[];
  private seq: number;

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
  ) {
    super();
    this.jobs = readJobs(file);
    this.seq = Math.max(0, ...this.jobs.map((j) => j.id));
  }

  async create(job: {
    resourceId: string;
    tag: string;
    start: Date | number;
    jobInterval: number;
  }) {
    // Study Squad only schedules one-time jobs (JobInterval.OneTime).
    if (job.jobInterval !== 1) throw new Error("only one-time jobs are supported");
    const id = ++this.seq;
    this.jobs.push({
      id,
      tag: job.tag,
      resourceId: job.resourceId,
      start: job.start instanceof Date ? job.start.getTime() : Number(job.start),
    });
    this.save();
    return { id: `job${id}` };
  }

  async deleteByTag(tag: string) {
    this.jobs = this.jobs.filter((j) => j.tag !== tag);
    this.save();
  }

  /** Fires every due job once. Called on a timer. */
  runDue() {
    const due = this.jobs.filter((j) => j.start <= this.now());
    if (due.length === 0) return;
    this.jobs = this.jobs.filter((j) => !due.includes(j));
    this.save();
    for (const job of due) {
      // Late by more than two polls (the server was down): Root calls that missed.
      const missed = this.now() - job.start > MISSED_AFTER_MS;
      this.emit(missed ? JOB_EVENT.JobMissed : JOB_EVENT.Job, {
        id: BigInt(job.id),
        jobScheduleId: `job${job.id}`,
        resourceId: job.resourceId,
        tag: job.tag,
        // Root delivers epoch milliseconds here, despite its types saying Date.
        jobTime: job.start,
      });
    }
  }

  private save() {
    fs.writeFileSync(this.file, JSON.stringify(this.jobs));
  }
}

function readJobs(file: string): Job[] {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Job[];
  } catch {
    return [];
  }
}
