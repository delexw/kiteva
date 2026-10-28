import puppeteer from "puppeteer-core";
import { systemEnvironment } from "../../../runtime/platform";
import { projectRuntimeEnvironment } from "../../../runtime/project-files";

/** Recording and human sign-in share window, profile, environment and launch defaults. */
export function launchReferenceBrowser(input: {
  executablePath: string;
  signal: AbortSignal;
  workspace?: string;
  profile?: string;
  temporaryDirectory?: string;
  presentation: "capture" | "sign-in" | "headless";
  mode: "local" | "hosted";
}) {
  const headed = input.presentation !== "headless";
  const appWindow = input.presentation === "capture";
  return puppeteer.launch({
    executablePath: input.executablePath,
    signal: input.signal,
    userDataDir: input.profile,
    ...(input.workspace
      ? {
          env: {
            ...systemEnvironment(),
            ...projectRuntimeEnvironment(input.workspace, "browser"),
            ...(input.temporaryDirectory
              ? {
                  TMPDIR: input.temporaryDirectory,
                  MAC_CHROMIUM_TMPDIR: input.temporaryDirectory,
                  TMP: input.temporaryDirectory,
                  TEMP: input.temporaryDirectory,
                }
              : {}),
          },
        }
      : {}),
    headless: headed ? false : "shell",
    ...(headed ? { defaultViewport: null } : {}),
    // An app window must not also open Puppeteer's default normal-browser tab.
    ...(appWindow ? { ignoreDefaultArgs: ["about:blank"] } : {}),
    timeout: 10000,
    args: [
      ...(appWindow ? ["--app=data:text/html,<title>Capture</title>"] : []),
      ...(headed ? ["--window-size=1440,1000"] : []),
      ...(input.mode === "hosted"
        ? ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>"]
        : []),
      "--disable-quic",
      "--disable-background-networking",
    ],
  });
}
