import { mkdtemp, mkdir, copyFile, writeFile, chmod, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
const execute = promisify(execFile);
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "install-check-"));
  const bin = path.join(root, "bin");
  await mkdir(bin);
  await copyFile(path.resolve("install.sh"), path.join(root, "install.sh"));
  await writeFile(path.join(root, "package-lock.json"), "{}");
  await writeFile(path.join(root, ".env.example"), "TYPESAFE_API_KEY=\n");
  const log = path.join(root, "commands.log");
  async function shim(name: string, body: string) {
    const file = path.join(bin, name);
    await writeFile(file, `#!/bin/bash\nset -eu\n${body}\n`);
    await chmod(file, 0o755);
  }
  await shim(
    "uname",
    'if [[ "$1" == -s ]]; then echo "${TEST_OS:-Darwin}"; else echo "${TEST_ARCH:-arm64}"; fi',
  );
  await shim(
    "node",
    'if [[ "$1" == -p ]]; then\n  if [[ -f "$INSTALL_PREFIX/node-upgraded" ]]; then echo 24;\n  elif [[ -n "${TEST_NODE_MAJOR:-}" ]]; then echo "$TEST_NODE_MAJOR";\n  else exec "$REAL_NODE" "$@"; fi\n  exit 0\nfi\nprintf "node %s\\n" "$*" >> "$INSTALL_LOG"',
  );
  await shim(
    "brew",
    'if [[ "$1" == --prefix ]]; then echo "$INSTALL_PREFIX"; exit 0; fi\nprintf "brew %s\\n" "$*" >> "$INSTALL_LOG"\ncase "$2" in\n  node) touch "$INSTALL_PREFIX/node-upgraded" ;;\n  ffmpeg) for tool in ffmpeg ffprobe; do printf \'#!/bin/bash\\nexit 0\\n\' > "$INSTALL_PREFIX/bin/$tool"; chmod +x "$INSTALL_PREFIX/bin/$tool"; done ;;\n  *) echo \'Unexpected package installation\' >&2; exit 99 ;;\nesac',
  );
  await shim(
    "npm",
    'printf "npm %s\\n" "$*" >> "$INSTALL_LOG"\nif [[ "$1" == ci && "${FAIL_NPM_CI:-0}" == 1 ]]; then exit 23; fi\nif [[ "$*" == "run multiplane:setup" && "${FAIL_MULTIPLANE_SETUP:-0}" == 1 ]]; then exit 29; fi',
  );
  for (const name of ["npx", "ffmpeg", "ffprobe"])
    await shim(name, `printf '${name} %s\\n' "$*" >> "$INSTALL_LOG"`);
  await shim(
    "uv",
    'printf "uv %s\\n" "$*" >> "$INSTALL_LOG"\nif [[ "$1" == python && "$2" == find ]]; then echo /test/python3.11; fi',
  );
  await shim(
    "git",
    'printf "git %s\\n" "$*" >> "$INSTALL_LOG"\nif [[ "$1" == clone ]]; then mkdir -p "${@: -1}"; cp "$AUDIO_INSTALLER_FIXTURE" "${@: -1}/install.sh"; fi',
  );
  const audio = path.join(root, "upstream-install.sh");
  await writeFile(audio, '#!/bin/bash\nprintf "audio-installer %s\\n" "$*" >> "$INSTALL_LOG"\n');
  await shim("curl", 'echo "Unexpected network access in installer test" >&2; exit 99');
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    REAL_NODE: process.execPath,
    INSTALL_PREFIX: root,
    INSTALL_LOG: log,
    AUDIO_INSTALLER_FIXTURE: audio,
  };
  return {
    root,
    log,
    env,
    run: (args: string[] = []) =>
      execute("/bin/bash", [path.join(root, "install.sh"), ...args], { env }),
    close: () => rm(root, { recursive: true, force: true }),
  };
}
it("runs the complete fresh-clone setup in order using isolated command fixtures", async () => {
  const f = await fixture();
  try {
    await f.run();
    const commands = await readFile(f.log, "utf8");
    for (const command of [
      "npm ci",
      "npm update @anthropic-ai/claude-agent-sdk",
      "npx --no-install browsers install chrome@stable",
      "npm run multiplane:setup",
      "node --import tsx scripts/setup-openscreen.ts",
      "npm run caveman:setup",
      "uv python install 3.11",
      "npm run speech:setup\n",
      "npm run speech:setup:pocket\n",
      "npm run speech:setup:pocket:zh",
      "npm run speech:setup:qwen",
      "npm run speech:setup:qwen:base",
      "git clone --depth 1 https://github.com/kanaworksai-hue/audio-studio-mcp.git",
      "audio-installer \n",
      "npm run build",
    ])
      expect(commands).toContain(command);
    expect(commands.indexOf("npm ci")).toBeLessThan(commands.indexOf("node --import tsx"));
    expect(commands.indexOf("audio-installer")).toBeLessThan(commands.indexOf("npm run build"));
    expect(await readFile(path.join(f.root, ".env.local"), "utf8")).toBe("TYPESAFE_API_KEY=\n");
  } finally {
    await f.close();
  }
});
it("preserves configuration and reuses the Audio Studio checkout on repeat installation", async () => {
  const f = await fixture();
  try {
    const config = "TYPESAFE_API_KEY=test-placeholder\nCUSTOM_SETTING=keep\n";
    await writeFile(path.join(f.root, ".env.local"), config);
    await f.run(["--speech", "none", "--audio-no-weights"]);
    await f.run(["--speech", "none", "--audio-no-weights"]);
    expect(await readFile(path.join(f.root, ".env.local"), "utf8")).toBe(config);
    const log = await readFile(f.log, "utf8");
    expect(log.match(/git clone/g)).toHaveLength(1);
    expect(log.match(/audio-installer --skip-weights/g)).toHaveLength(2);
    expect(log).not.toContain("speech:setup");
  } finally {
    await f.close();
  }
});
it("supports opting out of optional runtimes without skipping app dependencies", async () => {
  const f = await fixture();
  try {
    await f.run([
      "--minimal",
      "--skip-openscreen",
      "--skip-browser",
      "--skip-caveman",
      "--skip-build",
    ]);
    expect(await readFile(f.log, "utf8")).toBe(
      "npm ci\nnpm update @anthropic-ai/claude-agent-sdk\n",
    );
  } finally {
    await f.close();
  }
});
it.each([["--speech"], ["--speech", "invalid"], ["--unknown"]])(
  "rejects invalid arguments %j before installation",
  async (...args) => {
    const f = await fixture();
    try {
      await expect(f.run(args)).rejects.toThrow();
      await expect(readFile(f.log)).rejects.toThrow();
    } finally {
      await f.close();
    }
  },
);
it("shows help without installation and refuses unsupported hosts", async () => {
  const f = await fixture();
  try {
    expect((await f.run(["--help"])).stdout).toContain("Usage: ./install.sh");
    await expect(
      execute("/bin/bash", [path.join(f.root, "install.sh")], {
        env: { ...f.env, TEST_OS: "Linux" },
      }),
    ).rejects.toThrow("supports macOS");
    await expect(readFile(f.log)).rejects.toThrow();
  } finally {
    await f.close();
  }
});

it("installs a missing system tool and upgrades an unsupported Node before npm ci", async () => {
  const f = await fixture();
  try {
    await rm(path.join(f.root, "bin", "ffprobe"));
    await execute(
      "/bin/bash",
      [
        path.join(f.root, "install.sh"),
        "--minimal",
        "--skip-openscreen",
        "--skip-browser",
        "--skip-caveman",
        "--skip-build",
      ],
      { env: { ...f.env, TEST_NODE_MAJOR: "20" } },
    );
    const log = await readFile(f.log, "utf8");
    expect(log).toContain("brew install node");
    expect(log).toContain("brew install ffmpeg");
    expect(log.indexOf("brew install ffmpeg")).toBeLessThan(log.indexOf("npm ci"));
  } finally {
    await f.close();
  }
});
it("stops on a dependency installation failure instead of reporting completion", async () => {
  const f = await fixture();
  try {
    await expect(
      execute("/bin/bash", [path.join(f.root, "install.sh")], {
        env: { ...f.env, FAIL_NPM_CI: "1" },
      }),
    ).rejects.toMatchObject({ code: 23 });
    expect(await readFile(f.log, "utf8")).toBe("npm ci\n");
  } finally {
    await f.close();
  }
});

it("sets up Qwen independently and rejects Intel hardware before installing", async () => {
  const f = await fixture();
  try {
    await f.run([
      "--speech",
      "qwen",
      "--skip-audio-studio",
      "--skip-openscreen",
      "--skip-browser",
      "--skip-caveman",
      "--skip-build",
    ]);
    const commands = await readFile(f.log, "utf8");
    expect(commands).toContain("npm run speech:setup:qwen");
    expect(commands).not.toContain("npm run speech:setup\n");
    expect(commands).not.toContain("speech:setup:pocket");
    Object.assign(f.env, { TEST_ARCH: "x86_64" });
    await expect(f.run(["--speech", "qwen"])).rejects.toThrow("Qwen3-TTS requires Apple Silicon");
  } finally {
    await f.close();
  }
});

it("sets up Base without requiring VoiceDesign or Kokoro", async () => {
  const f = await fixture();
  try {
    await f.run([
      "--speech",
      "qwen-base",
      "--skip-audio-studio",
      "--skip-openscreen",
      "--skip-browser",
      "--skip-caveman",
      "--skip-build",
    ]);
    const commands = await readFile(f.log, "utf8");
    expect(commands).toContain("npm run speech:setup:qwen:base");
    expect(commands).not.toContain("npm run speech:setup:qwen\n");
    expect(commands).not.toContain("npm run speech:setup\n");
    Object.assign(f.env, { TEST_ARCH: "x86_64" });
    await expect(f.run(["--speech", "qwen-base"])).rejects.toThrow(
      "Qwen3-TTS requires Apple Silicon",
    );
  } finally {
    await f.close();
  }
});

it("stops installation when Multiplane browser verification fails", async () => {
  const f = await fixture();
  try {
    Object.assign(f.env, { FAIL_MULTIPLANE_SETUP: "1" });
    await expect(f.run()).rejects.toMatchObject({ code: 29 });
    const commands = await readFile(f.log, "utf8");
    expect(commands).toContain("npm run multiplane:setup");
    expect(commands).not.toContain("npm run build");
  } finally {
    await f.close();
  }
});
