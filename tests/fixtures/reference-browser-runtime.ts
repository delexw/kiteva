import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createLocalReferenceBrowser } from "../../src/server/jobs/subworkflows/website-reference";

const web = createServer((request, response) => {
  if (request.url === "/background-stream") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.write("Background updates remain connected");
    return;
  }
  response.setHeader("content-type", "text/html");
  response.end(`<!doctype html><h1>Form example</h1><div style="height:1100px"></div>
    <label>Project title<input onbeforeinput="document.querySelector('output').textContent='TYPING_BOUNDS:'+Math.round(this.getBoundingClientRect().top)+':'+Math.round(this.getBoundingClientRect().bottom)+':'+innerHeight"></label>
    <button onclick="fetch('/background-stream');document.querySelector('h1').textContent='Preview ready'">Build demo</button>
    <output></output><div style="height:1500px"></div>`);
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
  console.log(
    JSON.stringify({
      runtime: "node --import tsx",
      fill: "passed",
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
