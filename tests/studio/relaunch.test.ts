import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RELAUNCH_CHECK_DESCRIPTION, type PluginToUi } from "../../src/types";
import { bootPlugin, cardFile } from "./pluginHarness";

const relaunchOf = (node: object) => (node as { relaunch?: Record<string, string> }).relaunch;

describe("manifest relaunch buttons", () => {
  it("declares Open and Check; every command the code sets is declared", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8"));
    expect(manifest.relaunchButtons).toEqual([
      { command: "open", name: "Open Component Studio" },
      { command: "check", name: "Check with Component Studio" },
    ]);
    // setRelaunchData throws above 1000 characters; the sidebar shows three lines.
    expect(RELAUNCH_CHECK_DESCRIPTION.length).toBeLessThan(60);
  });
});

describe("sidebar relaunch data", () => {
  it("start sets the Open button on the file and the page", async () => {
    const plugin = await bootPlugin(cardFile());
    expect(plugin.relaunch).toEqual([
      { node: "root", data: { open: "" } },
      { node: "page", data: { open: "" } },
    ]);
  });

  it("a view-only file (setRelaunchData throws) still starts", async () => {
    const card = cardFile();
    const f = (globalThis as unknown as { figma: { root: Record<string, unknown> } }).figma;
    f.root.setRelaunchData = () => {
      throw new Error("read-only file");
    };
    await expect(bootPlugin(card)).resolves.toBeDefined();
  });

  it("a successful Apply sets Open + Check on the component root", async () => {
    const card = cardFile();
    const plugin = await bootPlugin(card);
    await plugin.send({ type: "component/scan", phase: "rename", useClaude: false });
    const msg = plugin.posted.find((m) => m.type === "component/proposal") as Extract<PluginToUi, { type: "component/proposal" }>;
    expect(relaunchOf(card.root)).toBeUndefined();
    await plugin.send({ type: "component/apply", proposal: msg.proposal });

    expect(plugin.posted.slice(-1)[0]?.type).toBe("component/applied");
    expect(card.frame.name).not.toBe("Frame 7");
    expect(relaunchOf(card.root)).toEqual({ open: "", check: RELAUNCH_CHECK_DESCRIPTION });
  });

  it("a check sets none; a normal scan after it makes Apply possible again", async () => {
    const card = cardFile();
    const plugin = await bootPlugin(card);
    await plugin.send({ type: "component/check", useClaude: false });
    expect(relaunchOf(card.root)).toBeUndefined();
    expect(plugin.relaunch).toHaveLength(2);

    await plugin.send({ type: "component/scan", phase: "rename", useClaude: false });
    const msg = plugin.posted.filter((m) => m.type === "component/proposal").slice(-1)[0] as Extract<PluginToUi, { type: "component/proposal" }>;
    await plugin.send({ type: "component/apply", proposal: msg.proposal });
    expect(plugin.posted.slice(-1)[0]?.type).toBe("component/applied");
  });
});

describe("launch command", () => {
  it('figma.command "check" tells the UI to open in QA mode once it is ready', async () => {
    const plugin = await bootPlugin(cardFile(), { command: "check" });
    expect(plugin.posted).toEqual([]);
    await plugin.send({ type: "ui/ready" });
    expect(plugin.posted).toEqual([{ type: "plugin/launch", command: "check" }]);
    expect(plugin.relaunch.map((r) => r.node)).toEqual(["root", "page"]);
  });

  it("any other command opens as usual", async () => {
    for (const command of ["", "open"]) {
      const plugin = await bootPlugin(cardFile(), { command });
      await plugin.send({ type: "ui/ready" });
      expect(plugin.posted).toEqual([{ type: "plugin/launch", command: "open" }]);
    }
  });
});
