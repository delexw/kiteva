import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import {
  installGeneralUser,
  generalUserRevision,
} from "../src/server/audio/instruments/generaluser";
it.each([503, 200])(
  "rejects download failures and checksum mismatches without publishing partial files (%s)",
  async (status) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "soundfont-setup-"));
    const request = vi.fn<typeof fetch>(
      async () => new Response("invalid upstream bytes", { status }),
    );
    try {
      await expect(
        installGeneralUser(new AbortController().signal, folder, request),
      ).rejects.toThrow(status === 503 ? "HTTP 503" : "checksum mismatch");
      expect(await readdir(folder)).toEqual([]);
      expect(String(request.mock.calls[0][0])).toContain(generalUserRevision);
      expect(request.mock.calls[0][1]?.redirect).toBe("error");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);
it("preserves an existing bank if its replacement fails validation", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "soundfont-setup-"));
  try {
    await writeFile(path.join(folder, "GeneralUser-GS.sf2"), "existing bank");
    await expect(
      installGeneralUser(
        new AbortController().signal,
        folder,
        async () => new Response("bad update"),
      ),
    ).rejects.toThrow("checksum mismatch");
    expect(await readdir(folder)).toEqual(["GeneralUser-GS.sf2"]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
