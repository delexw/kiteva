import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StudioSelect,
  StudioSelectOption,
  studioSelectOptions,
} from "../src/client/components/studio-select";
it("uses an accessible framework combobox and accepts numeric controlled values", () => {
  const html = renderToStaticMarkup(
    <StudioSelect
      aria-label="Preview options"
      aria-describedby="preview-help"
      value={3}
      onValueChange={() => {}}
    >
      <StudioSelectOption value={3}>Three directions</StudioSelectOption>
    </StudioSelect>,
  );
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-label="Preview options"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-describedby="preview-help"');
  expect(html).toContain("Three directions");
});
it("preserves the disabled state and accessible label", () => {
  const html = renderToStaticMarkup(
    <StudioSelect aria-label="Model" disabled value="claude" onValueChange={() => {}}>
      <StudioSelectOption value="claude">Opus 5.5</StudioSelectOption>
    </StudioSelect>,
  );
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-label="Model"');
});

it("preserves explicit IDs, numeric values and disabled options independently of labels", () => {
  expect(
    studioSelectOptions([
      <StudioSelectOption key="a" value="id-a">
        Same label
      </StudioSelectOption>,
      <StudioSelectOption key="b" value="id-b" disabled>
        Same label
      </StudioSelectOption>,
      <StudioSelectOption key="n" value={3}>
        Three directions
      </StudioSelectOption>,
    ]),
  ).toEqual([
    { value: "id-a", label: "Same label", disabled: undefined },
    { value: "id-b", label: "Same label", disabled: true },
    { value: "3", label: "Three directions", disabled: undefined },
  ]);
});
