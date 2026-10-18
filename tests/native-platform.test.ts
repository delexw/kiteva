import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultPython,
  nativeExecutable,
  systemEnvironment,
  userHome,
} from "../src/server/runtime/platform";

afterEach(() => vi.unstubAllEnvs());
describe("native platform environment", () => {
  it("uses USERPROFILE when Windows has no HOME", () => {
    expect(userHome({ USERPROFILE: "C:\\Users\\Creator" })).toBe("C:\\Users\\Creator");
    expect(userHome({ HOME: "/explicit", USERPROFILE: "C:\\Users\\Creator" })).toBe("/explicit");
  });
  it("preserves case-insensitive Windows system keys without forwarding credentials", () => {
    const env = systemEnvironment({
      Path: "C:\\Tools",
      SYSTEMROOT: "C:\\Windows",
      TEMP: "C:\\Temp",
      USERPROFILE: "C:\\Users\\Creator",
      ANTHROPIC_API_KEY: "private",
      NODE_OPTIONS: "--require=evil",
    });
    expect(env).toMatchObject({
      PATH: "C:\\Tools",
      SystemRoot: "C:\\Windows",
      TEMP: "C:\\Temp",
      HOME: "C:\\Users\\Creator",
    });
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("NODE_OPTIONS");
  });
  it("chooses native binaries and the usual Python command", () => {
    expect(nativeExecutable("caveman-mcp", "win32")).toBe("caveman-mcp.exe");
    expect(nativeExecutable("caveman-mcp", "darwin")).toBe("caveman-mcp");
    expect(defaultPython("win32")).toBe("python");
    expect(defaultPython("darwin")).toBe("python3");
  });
});
