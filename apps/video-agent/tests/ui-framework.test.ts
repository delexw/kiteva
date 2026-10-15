import { expect, it } from "vitest";
import { cn } from "../src/client/lib/utils";
it("merges framework utility overrides without discarding conditional product classes", () => {
  expect(cn("px-2 text-sm", false, { active: true }, "px-4")).toBe("text-sm active px-4");
});
