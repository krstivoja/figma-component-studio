import { build, context } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync, watch as watchFile, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const TAILWIND_BIN = "node_modules/.bin/tailwindcss";
const CSS_IN = "src/ui/styles.css";

const codeOpts = {
  entryPoints: ["src/code.ts"],
  outfile: "dist/code.js",
  bundle: true,
  target: "es2017",
  logLevel: "info",
};

const uiOpts = {
  entryPoints: ["src/ui/main.tsx"],
  outfile: "dist/ui.bundle.js",
  bundle: true,
  target: "es2017",
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
};

// Tailwind scans src/ui for class names, so the CSS is rebuilt after every UI bundle. Without -o it prints to stdout.
function buildCss() {
  return execFileSync(TAILWIND_BIN, ["-i", CSS_IN, "--minify"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function inlineUi() {
  const css = buildCss();
  const template = readFileSync("src/ui.html", "utf8");
  const script = readFileSync("dist/ui.bundle.js", "utf8");
  // Function replacements: `$` sequences in the bundle must stay literal.
  const html = template
    .replace("<!-- STYLE -->", () => `<style>${css}</style>`)
    .replace("<!-- SCRIPT -->", () => `<script>${script.replace(/<\/script/gi, "<\\/script")}</script>`);
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
          b.onEnd((result) => {
            if (result.errors.length) return;
            try {
              inlineUi();
            } catch (e) {
              console.error(`[inline-ui] ${e instanceof Error ? e.message : e}`);
            }
          });
        },
      },
    ],
  });
  await codeCtx.watch();
  await uiCtx.watch();
  // esbuild does not see the CSS entry or the HTML template; rebuild the UI when they change.
  for (const file of [CSS_IN, "src/ui.html"]) watchFile(file, () => uiCtx.rebuild().catch(() => {}));
} else {
  await build(codeOpts);
  await build(uiOpts);
  inlineUi();
}
