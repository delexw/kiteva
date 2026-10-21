import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createLocalReferenceBrowser } from "../../src/server/jobs/subworkflows/website-reference";

const web = createServer((request, response) => {
  if (request.url === "/api") {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      response.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": "demo_session=example; Path=/; HttpOnly",
      });
      response.end(
        JSON.stringify({
          method: request.method,
          headers: request.headers,
          body: Buffer.concat(chunks).toString("base64"),
        }),
      );
    });
    return;
  }
  if (request.url === "/background-stream") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.write("Background updates remain connected");
    return;
  }
  response.setHeader("content-type", "text/html");
  response.end(`<!doctype html><h1>Form example</h1><div style="height:1100px"></div>
    <label>Project title<input onbeforeinput="document.querySelector('output').textContent='TYPING_BOUNDS:'+Math.round(this.getBoundingClientRect().top)+':'+Math.round(this.getBoundingClientRect().bottom)+':'+innerHeight"></label>
    <button onclick="fetch('/background-stream');document.querySelector('h1').textContent='Preview ready'">Build demo</button>
    <label>Reference image<input type="file" accept="image/png" style="display:none" onchange="document.querySelector('output').textContent='ATTACHED:'+this.files[0].name"></label><output></output><div style="height:1500px"></div>`);
});
await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
const address = web.address();
assert(address && typeof address !== "string");
const url = `http://127.0.0.1:${address.port}`;
const browser = await createLocalReferenceBrowser([url], new AbortController().signal, "local");
try {
  const initial = await browser.inspect(url);
  const input = initial.controls.find((control) => control.name === "Project title");
  assert(input);
  await assert.rejects(browser.fill(input.id, "An idea"), /outside the visible viewport/);
  const scrolled = await browser.scroll(1000);
  const visibleInput = scrolled.controls.find((control) => control.name === "Project title");
  assert(visibleInput);
  const filled = await browser.fill(visibleInput.id, "An idea");
  const bounds = filled.text.match(/TYPING_BOUNDS:(\d+):(\d+):(\d+)/);
  assert(bounds);
  assert(Number(bounds[1]) >= 0 && Number(bounds[2]) <= Number(bounds[3]));
  const button = filled.controls.find((control) => control.name === "Build demo");
  assert(button);
  const clickStarted = performance.now();
  const clicked = await browser.click(button.id);
  const clickSeconds = (performance.now() - clickStarted) / 1000;
  assert(clicked.text.includes("Preview ready"));
  assert(clickSeconds < 2, `Ready controls must not wait for background traffic: ${clickSeconds}s`);
  const fileInput = clicked.controls.find((control) => control.type === "file");
  assert(fileInput);
  assert.equal(fileInput.accept, "image/png");
  assert.equal(fileInput.multiple, false);
  const folder = await mkdtemp(path.join(os.tmpdir(), "browser-upload-"));
  try {
    const file = path.join(folder, "sample.png");
    await writeFile(
      file,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQh8AAAAASUVORK5CYII=",
        "base64",
      ),
    );
    await assert.rejects(browser.upload(input.id, [file]), /File input was not found/);
    await assert.rejects(browser.upload(fileInput.id, [file, file]), /multiple files/);
    const uploaded = await browser.upload(fileInput.id, [file]);
    assert(uploaded.text.includes("ATTACHED:sample.png"));
    const evaluate = async (expression: string) =>
      (await browser.perform({ operation: "browser_evaluate", expression }, folder)).data;
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const result = (await evaluate(`fetch('/api', {
        method: '${method}',
        headers: {'content-type':'application/json', authorization:'Bearer example-token'},
        body: JSON.stringify({title:'An idea'})
      }).then(r=>r.json())`)) as { method: string; headers: Record<string, string>; body: string };
      assert.equal(result.method, method);
      assert.equal(result.headers.authorization, "Bearer example-token");
      assert.equal(Buffer.from(result.body, "base64").toString(), '{"title":"An idea"}');
      if (method !== "POST") assert.equal(result.headers.cookie, "demo_session=example");
    }
    const upload = (await evaluate(`(() => {
      const data = new FormData();
      data.append('image', document.querySelector('input[type=file]').files[0]);
      return fetch('/api', {method:'POST', body:data}).then(r=>r.json());
    })()`)) as { method: string; headers: Record<string, string>; body: string };
    const multipart = await new Response(Buffer.from(upload.body, "base64"), {
      headers: { "content-type": upload.headers["content-type"] },
    }).formData();
    const image = multipart.get("image") as File;
    assert.equal(image.name, "sample.png");
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), await readFile(file));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify({
      runtime: "node --import tsx",
      fill: "passed",
      hiddenFileUpload: "passed",
      nativeRequests: "passed",
      binaryMultipartUpload: "passed",
      click: "passed",
      explicitScrollBeforeTyping: true,
      visibleBeforeTyping: true,
      backgroundTrafficDoesNotDelayReadyControls: true,
      clickSeconds,
    }),
  );
} finally {
  await browser.close();
  web.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    web.close((error) => (error ? reject(error) : resolve())),
  );
}
