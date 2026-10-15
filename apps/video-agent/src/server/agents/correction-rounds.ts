export type CorrectionTier = "cheap" | "main";

export const correctionRoundBudget = { cheap: 20, main: 2 } as const;

/** A round consumes one budget entry and addresses every issue before its caller rechecks. */
export class CorrectionRounds {
  private rounds = { cheap: 0, main: 0 };

  constructor(
    private readonly budget: Readonly<Record<CorrectionTier, number>> = correctionRoundBudget,
  ) {}

  async run<T extends { cheapEligible: boolean }>(
    findings: readonly T[],
    signal: AbortSignal,
    repair: (finding: T, tier: CorrectionTier, index: number) => Promise<void>,
  ): Promise<void> {
    signal.throwIfAborted();
    if (!findings.length) return;
    const tier: CorrectionTier =
      this.rounds.main === 0 &&
      findings.every((finding) => finding.cheapEligible) &&
      this.rounds.cheap < this.budget.cheap
        ? "cheap"
        : "main";
    if (this.rounds[tier] >= this.budget[tier])
      throw Error("The correction round limit was reached");
    this.rounds[tier]++;
    for (const [index, finding] of findings.entries()) {
      signal.throwIfAborted();
      await repair(finding, tier, index);
    }
  }
}
