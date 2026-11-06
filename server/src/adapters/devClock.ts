/** Where the offset is kept, so a restart never sends the game clock back. */
export const DEV_CLOCK_KEY = "dev:clockOffsetMs";

export interface DevClockStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * The engine's clock: real time plus an offset that only the developer's
 * `!clock` command moves, and only forward (stored data never ends up in the
 * future of the clock). 0 everywhere Developer test mode was never used.
 */
export class DevClock {
  private offsetMs = 0;

  constructor(
    private readonly store: DevClockStore,
    private readonly realNow: () => number = Date.now,
  ) {}

  async load(): Promise<void> {
    const stored = await this.store.get<number>(DEV_CLOCK_KEY);
    this.offsetMs = typeof stored === "number" && stored > 0 ? stored : 0;
  }

  readonly now = (): number => this.realNow() + this.offsetMs;

  offset(): number {
    return this.offsetMs;
  }

  async advance(ms: number): Promise<number> {
    if (!(ms > 0)) throw new Error("The clock only moves forward.");
    this.offsetMs += ms;
    await this.store.set(DEV_CLOCK_KEY, this.offsetMs);
    return this.offsetMs;
  }
}
