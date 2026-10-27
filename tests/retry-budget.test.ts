import { expect, it } from "vitest";
import { RetryBudget, RetryBudgets } from "../src/shared/retry-budget";

it("charges exactly the configured attempts without resetting on repeated iteration", () => {
  const budget = new RetryBudget(3);
  expect(budget.take()).toEqual({ index: 0, number: 1, remaining: 2 });
  expect([...budget]).toEqual([
    { index: 1, number: 2, remaining: 1 },
    { index: 2, number: 3, remaining: 0 },
  ]);
  expect([...budget]).toEqual([]);
  expect(budget.take()).toBeUndefined();
  expect(budget.used).toBe(3);
});

it("retains each operation's budget while other operations get their full allowance", () => {
  const scopes = new RetryBudgets();
  expect([...scopes.for("first", 10)]).toHaveLength(10);
  expect(scopes.for("first", 10).take()).toBeUndefined();
  expect(scopes.for("second", 10).take()?.number).toBe(1);
  expect(new RetryBudgets().for("first", 10).used).toBe(0);
  expect(() => scopes.for("first", 3)).toThrow("limit changed");
});

it("does not charge a cancelled attempt", () => {
  const budget = new RetryBudget(2);
  const controller = new AbortController();
  controller.abort();
  expect(() => budget.take(controller.signal)).toThrow();
  expect(budget.used).toBe(0);
});

it.each([0, -1, 1.5, Infinity, NaN])("rejects an invalid limit %s", (limit) => {
  expect(() => new RetryBudget(limit)).toThrow("positive safe integer");
});
