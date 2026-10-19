import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createLocalReferenceBrowser } from "../../src/server/jobs/subworkflows/website-reference";

const web = createServer((_request, response) => {
  response.setHeader("content-type", "text/html");
  response.end(`<!doctype html><h1>Form example</h1><div style="height:1100px"></div>
    <label>Project title<input onbeforeinput="document.querySelector('output').textContent='TYPING_CENTER:'+Math.round(this.getBoundingClientRect().top+this.getBoundingClientRect().height/2)+':'+Math.round(innerHeight/2)"></label>
    <button onclick="document.querySelector('h1').textContent='Preview ready'">Build demo</button>
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
  const filled = await browser.fill(input.id, "An idea");
  const centers = filled.text.match(/TYPING_CENTER:(\d+):(\d+)/);
  assert(centers);
  assert(Math.abs(Number(centers[1]) - Number(centers[2])) <= 1);
  const button = filled.controls.find((control) => control.name === "Build demo");
  assert(button);
  const clicked = await browser.click(button.id);
  assert(clicked.text.includes("Preview ready"));
  console.log(
    JSON.stringify({
      runtime: "node --import tsx",
      fill: "passed",
      click: "passed",
      centeredBeforeTyping: true,
    }),
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    web.close((error) => (error ? reject(error) : resolve())),
  );
}
