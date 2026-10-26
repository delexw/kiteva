import { expect, it } from "vitest";
import { buildRouteLabel, buildRouteOf } from "../src/shared/build-route";
import {
  creativeApproaches,
  creativeApproachLabel,
  type CreativeApproach,
} from "../src/shared/creative-approach";

it.each(Object.keys(creativeApproaches) as CreativeApproach[])(
  "keeps every build route independent of the %s creative approach",
  (preference) => {
    const automatic = { preference, candidateCount: 3 };
    const selected = { ...automatic, selectedStyleIds: ["style-001"] };
    const direct = { ...selected, candidateCount: 0 };
    expect(buildRouteOf(automatic)).toBe("automatic-previews");
    expect(buildRouteOf(selected)).toBe("selected-previews");
    expect(buildRouteOf(direct)).toBe("direct-build");
    for (const request of [automatic, selected, direct]) {
      expect(creativeApproachLabel(request)).toBe(creativeApproaches[preference].label);
      expect(buildRouteLabel(request)).not.toBe(creativeApproachLabel(request));
    }
  },
);

it("does not treat an empty Settings selection or an embedded mention as selected styles", () => {
  const request = {
    candidateCount: 2,
    selectedStyleIds: [],
    instructions: 'Use <style id="style-001">Example</style> only for the credits.',
  };
  expect(buildRouteOf(request)).toBe("automatic-previews");
  expect(request.instructions).toContain('id="style-001"');
});
