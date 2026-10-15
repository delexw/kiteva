import { matchRoutes } from "react-router-dom";

const routes = [
  { path: "/", id: "create" },
  { path: "/projects/:projectId", id: "create" },
  { path: "/projects/:projectId/storyboard", id: "storyboard" },
  { path: "/styles", id: "styles" },
  { path: "/styles/:styleId", id: "styles" },
  { path: "/motions", id: "motions" },
  { path: "/technologies", id: "technologies" },
  { path: "/projects", id: "history" },
  { path: "/governance", id: "governance" },
];

export function appRoute(pathname: string) {
  const match = matchRoutes(routes, pathname)?.[0];
  return {
    page: match?.route.id || "create",
    projectId: match?.params.projectId,
    styleId: match?.params.styleId,
  };
}
