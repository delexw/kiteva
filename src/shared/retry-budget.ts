export interface RetryAttempt {
  /** Zero-based index for delay schedules and array-based effort policies. */
  index: number;
  /** One-based attempt number for logs and progress. */
  number: number;
  remaining: number;
}

/** One operation owns one budget. Taking an attempt is the only way to charge it. */
export class RetryBudget implements Iterable<RetryAttempt> {
  private usedAttempts = 0;

  constructor(readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw Error("Retry budget must be a positive safe integer");
  }

  get used() {
    return this.usedAttempts;
  }

  get remaining() {
    return this.limit - this.usedAttempts;
  }

  take(signal?: AbortSignal): RetryAttempt | undefined {
    signal?.throwIfAborted();
    if (!this.remaining) return undefined;
    const index = this.usedAttempts++;
    return { index, number: this.usedAttempts, remaining: this.remaining };
  }

  *[Symbol.iterator]() {
    let attempt: RetryAttempt | undefined;
    while ((attempt = this.take())) yield attempt;
  }
}

/** A caller-local collection keeps independent operations from sharing a counter. */
export class RetryBudgets {
  private readonly budgets = new Map<string, RetryBudget>();

  for(key: string, limit: number) {
    const existing = this.budgets.get(key);
    if (existing) {
      if (existing.limit !== limit) throw Error("Retry budget limit changed for an existing scope");
      return existing;
    }
    const budget = new RetryBudget(limit);
    this.budgets.set(key, budget);
    return budget;
  }
}
