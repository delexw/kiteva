export interface TechnologyAvailability {
  id: string;
  name: string;
  category: "browser_library" | "host_tool" | "native" | "technique" | "asset";
  status: "available" | "unavailable" | "requires_assets" | "requires_implementation";
  package?: string;
  version?: string;
  license?: string;
  entry?: string;
  executable?: string;
  guidance: string;
}

export interface PreparedTechnology {
  id: string;
  directory: string;
  modulePath: string;
  cssPaths: string[];
  assetPaths: string[];
  importStatement: string;
  packages: string[];
  guidance: string;
}

export type TechnologyToolResult =
  | { kind: "availability"; technologies: TechnologyAvailability[] }
  | { kind: "prepared"; technology: PreparedTechnology }
  | {
      kind: "stylesheet";
      technology: { id: string; directory: string; cssPaths: string[]; assetPaths: string[] };
    }
  | { kind: "error"; message: string };
