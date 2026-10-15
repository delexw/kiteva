import { expect, it, vi } from "vitest";
import {
  CorrectionRounds,
  correctionRoundBudget,
  type CorrectionTier,
} from "../src/server/agents/correction-rounds";
it("charges each check round once regardless of issue count and then escalates", async () => {
  const rounds = new CorrectionRounds();
  const signal = new AbortController().signal;
  const repair = vi.fn<
    (finding: { cheapEligible: boolean }, tier: CorrectionTier, index: number) => Promise<void>
  >(async () => {});
  const findings = [
    { cheapEligible: true, id: 1 },
    { cheapEligible: true, id: 2 },
    { cheapEligible: true, id: 3 },
  ];
  for (let i = 0; i < correctionRoundBudget.cheap; i++) await rounds.run(findings, signal, repair);
  expect(repair).toHaveBeenCalledTimes(60);
  expect(repair.mock.calls.every((call) => call[1] === "cheap")).toBe(true);
  await rounds.run(findings, signal, repair);
  await rounds.run(findings, signal, repair);
  expect(repair.mock.calls.slice(60).every((call) => call[1] === "main")).toBe(true);
  await expect(rounds.run(findings, signal, repair)).rejects.toThrow("round limit");
  expect(repair).toHaveBeenCalledTimes(66);
});
it("uses one main tier for a mixed round and stays on main for later rounds", async () => {
  const rounds = new CorrectionRounds();
  const signal = new AbortController().signal;
  const repair = vi.fn<
    (finding: { cheapEligible: boolean }, tier: CorrectionTier, index: number) => Promise<void>
  >(async () => {});
  await rounds.run([{ cheapEligible: true }, { cheapEligible: false }], signal, repair);
  await rounds.run([{ cheapEligible: true }], signal, repair);
  expect(repair.mock.calls.map((call) => call[1])).toEqual(["main", "main", "main"]);
});
it("runs issues serially and stops when cancelled", async () => {
  const rounds = new CorrectionRounds();
  const controller = new AbortController();
  const order: number[] = [];
  await expect(
    rounds.run(
      [
        { cheapEligible: true, id: 1 },
        { cheapEligible: true, id: 2 },
      ],
      controller.signal,
      async (finding) => {
        order.push(finding.id);
        controller.abort();
      },
    ),
  ).rejects.toThrow();
  expect(order).toEqual([1]);
});
