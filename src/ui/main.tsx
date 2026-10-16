import { createRoot } from "react-dom/client";
import { startBridge } from "../bridge";
import type { BridgeStatus } from "../types";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);
const render = (status: BridgeStatus) => root.render(<App bridgeStatus={status} />);

render("disconnected");
// The Claude Code bridge lives outside React: one WebSocket for the window's lifetime.
startBridge(render);
