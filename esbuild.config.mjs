import { build, context } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");

const codeOpts = {
  entryPoints: ["src/code.ts"],
  outfile: "dist/code.js",
  bundle: true,
  target: "es2017",
  logLevel: "info",
};

const uiOpts = {
  entryPoints: ["src/ui.ts"],
  outfile: "dist/ui.bundle.js",
  bundle: true,
  target: "es2017",
  logLevel: "info",
};

function inlineUi() {
  const template = readFileSync("src/ui.html", "utf8");
  const script = readFileSync("dist/ui.bundle.js", "utf8");
  const html = template.replace(
    "<!-- SCRIPT -->",
    `<script>${script}</script>`,
  );
  writeFileSync("dist/ui.html", html);
}

if (watch) {
  const codeCtx = await context(codeOpts);
  const uiCtx = await context({
    ...uiOpts,
    plugins: [
      {
        name: "inline-ui",
        setup(b) {
          b.onEnd(() => inlineUi());
        },
      },
    ],
  });
  await codeCtx.watch();
  await uiCtx.watch();
} else {
  await build(codeOpts);
  await build(uiOpts);
  inlineUi();
}
