import { refreshSkills } from "./agents/bundled-skills/installation.js";
import { bundledSkills } from "./agents/bundled-skills/registry.js";
import { stopCaveman } from "./agents/caveman.js";
import { createApp } from "./app.js";
import { port } from "./runtime/config.js";
await refreshSkills(bundledSkills);
const { app } = await createApp();
await app.listen({ port, host: "127.0.0.1" });
console.log(`Video agent: http://127.0.0.1:${port}`);
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () => {
    void app
      .close()
      .then(stopCaveman)
      .then(() => process.exit(0));
  });
