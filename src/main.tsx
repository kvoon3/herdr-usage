import { createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import { App } from "./app.tsx";
import { loadUsage } from "./providers.ts";
import { resolveTheme } from "./theme.ts";

const theme = resolveTheme();
const renderer = await createCliRenderer({ exitOnCtrlC: true, backgroundColor: theme.bg });

void render(
  () => (
    <App
      theme={theme}
      load={loadUsage}
      close={() => {
        renderer.destroy();
        process.exit(0);
      }}
    />
  ),
  renderer,
);
