import { RetryBudget } from "../../shared/retry-budget";
export type CorrectionTier = "cheap" | "main";

export const correctionRoundBudget = { cheap: 20, main: 2 } as const;

/** A round consumes one budget entry and addresses every issue before its caller rechecks. */
export class CorrectionRounds {
  private readonly rounds: Record<CorrectionTier, RetryBudget>;

  constructor(budget: Readonly<Record<CorrectionTier, number>> = correctionRoundBudget) {
    this.rounds = { cheap: new RetryBudget(budget.cheap), main: new RetryBudget(budget.main) };
  }

  async run<T extends { cheapEligible: boolean }>(
    findings: readonly T[],
    signal: AbortSignal,
    repair: (finding: T, tier: CorrectionTier, index: number) => Promise<void>,
  ): Promise<void> {
    signal.throwIfAborted();
    if (!findings.length) return;
    const tier: CorrectionTier =
      this.rounds.main.used === 0 &&
      findings.every((finding) => finding.cheapEligible) &&
      this.rounds.cheap.remaining > 0
        ? "cheap"
        : "main";
    if (!this.rounds[tier].take(signal)) throw Error("The correction round limit was reached");
    for (const [index, finding] of findings.entries()) {
      signal.throwIfAborted();
      await repair(finding, tier, index);
    }
  }
}
