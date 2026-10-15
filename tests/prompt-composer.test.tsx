import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from "../src/client/components/ai-elements/prompt-input";
import { StudioSelect, StudioSelectOption } from "../src/client/components/studio-select";
it("composes the prompt, settings, and submission as one accessible form", () => {
  const html = renderToStaticMarkup(
    <PromptInput aria-label="Create a project" onSubmit={() => {}}>
      <PromptInputBody>
        <PromptInputTextarea
          aria-label="Project instructions"
          value="An idea"
          onChange={() => {}}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <StudioSelect aria-label="Model" value="claude" onValueChange={() => {}}>
            <StudioSelectOption value="claude">Opus 5.5</StudioSelectOption>
          </StudioSelect>
        </PromptInputTools>
        <PromptInputSubmit aria-label="Generate" disabled>
          Generate
        </PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>,
  );
  const form = html.slice(html.indexOf("<form"), html.indexOf("</form>"));
  expect(form).toContain('aria-label="Project instructions"');
  expect(form).toContain('aria-label="Model"');
  expect(form).toContain('type="submit"');
  expect(form).toContain('aria-label="Generate"');
  expect(form).toContain('disabled=""');
});
