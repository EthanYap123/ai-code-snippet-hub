// Builds the static GitHub Pages demo into ./out (see next.config.ts).
import { spawnSync } from "node:child_process";
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_PUBLIC_DEMO: "1" },
});
if (result.status !== 0) process.exit(result.status ?? 1);

// The export writes per-segment prefetch data as `about/__next.about/__PAGE__.txt`,
// but the client requests `about/__next.about.__PAGE__.txt`. Add the flat copies so
// link prefetches succeed on a plain static host.
let copied = 0;
function flatten(dir, prefix) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) flatten(path, `${prefix}.${name}`);
    else {
      copyFileSync(path, `${prefix}.${name}`);
      copied++;
    }
  }
}
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory() || name === "_next") continue;
    if (name.startsWith("__next.")) flatten(path, path);
    else walk(path);
  }
}
walk("out");
console.log(`build-demo: added ${copied} flat prefetch file(s)`);
