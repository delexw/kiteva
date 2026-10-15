import { expect, it } from "vitest";
import { appRoute } from "../src/client/lib/app-route";

it.each([
  ["/", "create"],
  ["/styles", "styles"],
  ["/motions", "motions"],
  ["/technologies", "technologies"],
  ["/projects", "history"],
  ["/governance", "governance"],
])("restores the page at %s", (path, page) => {
  expect(appRoute(path)).toEqual({ page, projectId: undefined, styleId: undefined });
});
it("loads only the project named in the URL", () => {
  expect(appRoute("/projects/example-project")).toEqual({
    page: "create",
    projectId: "example-project",
    styleId: undefined,
  });
});
it("restores a style detail route", () => {
  expect(appRoute("/styles/style-001")).toEqual({
    page: "styles",
    styleId: "style-001",
    projectId: undefined,
  });
});
it("does not interpret unrelated paths as projects", () => {
  expect(appRoute("/unknown/page").projectId).toBeUndefined();
});
it("opens a project storyboard at a dedicated shareable route", () => {
  expect(appRoute("/projects/example-project/storyboard")).toEqual({
    page: "storyboard",
    projectId: "example-project",
    styleId: undefined,
  });
});
