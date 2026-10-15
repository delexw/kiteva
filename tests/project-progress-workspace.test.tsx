import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectProgressWorkspace } from "../src/client/components/project-progress-workspace";

it("keeps live progress above the direction dock in the same workspace", () => {
  const html = renderToStaticMarkup(
    <ProjectProgressWorkspace progress={<div role="log">Creating your preview</div>}>
      <article aria-busy="true">Direction 1</article>
      <article>
        <video controls src="/preview.mp4" />
        <button>Choose direction</button>
      </article>
    </ProjectProgressWorkspace>,
  );
  expect(html.indexOf('role="log"')).toBeLessThan(html.indexOf('class="project-direction-dock"'));
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain("Choose direction");
});
it("shows only progress until selected directions are supplied", () => {
  const html = renderToStaticMarkup(
    <ProjectProgressWorkspace progress={<div role="log">Finding your creative direction</div>}>
      {false}
    </ProjectProgressWorkspace>,
  );
  expect(html).toContain("Finding your creative direction");
  expect(html).not.toContain("project-direction-dock");
  expect(html).not.toContain("<article");
});
