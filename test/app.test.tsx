import { expect, test } from "bun:test";
import type { UsageSnapshot } from "@kvoon/pi-minimal-footer/usage.ts";
import { testRender } from "@opentui/solid";
import { App } from "../src/app.tsx";
import { providerName, type Loader } from "../src/providers.ts";
import { fallbackTheme } from "../src/theme.ts";

const NOW = Date.now();

const fixtures: Record<string, UsageSnapshot> = {
  claude: {
    provider: "Claude Max",
    fetchedAt: NOW,
    windows: [
      { label: "5h", usedPercent: 58.34, resetsIn: "2h38m" },
      { label: "Weekly", usedPercent: 21, resetsIn: "4d2h" },
    ],
  },
  workbuddy: {
    provider: "WorkBuddy",
    fetchedAt: NOW,
    windows: [{ label: "credits", usedPercent: 0.9, credits: { remain: 1090, size: 1100, accounts: 3, okAccounts: 2 } }],
  },
};

/** Every provider answers; those without a fixture report no credential. */
const loader: Loader = async (ids, onEach) =>
  Promise.all(
    ids.map(async (id) => {
      const snapshot = fixtures[id] ?? { provider: providerName(id), windows: [], error: "no-auth", fetchedAt: NOW };
      const loaded = { id, name: providerName(id), snapshot };
      onEach?.(loaded);
      return loaded;
    }),
  );

/** Four windows per provider: more rows than a short fixture frame can hold. */
const crowded: Loader = async (ids, onEach) =>
  Promise.all(
    ids.map(async (id) => {
      const snapshot: UsageSnapshot = {
        provider: providerName(id),
        fetchedAt: NOW,
        windows: Array.from({ length: 4 }, (_, index) => ({ label: `w${index}`, usedPercent: 42, resetsIn: "1h" })),
      };
      const loaded = { id, name: providerName(id), snapshot };
      onEach?.(loaded);
      return loaded;
    }),
  );

function render(load: Loader = loader, height = 44) {
  return testRender(() => <App theme={fallbackTheme} load={load} close={() => {}} />, { width: 90, height });
}

type Setup = Awaited<ReturnType<typeof render>>;

function hex(color: { buffer: Record<number, number> }): string {
  return `#${[0, 1, 2].map((index) => color.buffer[index]!.toString(16).padStart(2, "0")).join("")}`;
}

function coloredSpans(setup: Setup) {
  return setup
    .captureSpans()
    .lines.flatMap((line) => line.spans)
    .filter((span) => span.text.trim());
}

test("renders each window of every configured provider", async () => {
  const setup = await render();
  const frame = await setup.waitForFrame((value) => value.includes("Claude Max"));
  expect(frame).toContain("58.3%");
  expect(frame).toContain("resets in 2h38m");
  expect(frame).toContain("WorkBuddy");
  expect(frame).toContain("$1090 / $1100 · 2/3 accounts");
  expect(frame).toContain("r refresh · a show all · j/k focus · ↵ open · ↑↓ scroll · esc close");
});

test("unconfigured providers stay hidden but are counted", async () => {
  const setup = await render();
  const frame = await setup.waitForFrame((value) => value.includes("Claude Max"));
  expect(frame).toContain("2 providers · 10 unconfigured");
  expect(frame).not.toContain("GitHub Copilot");
  expect(frame).not.toContain("Not configured");
});

test("the first provider is focused and marked", async () => {
  const setup = await render();
  const frame = await setup.waitForFrame((value) => value.includes("Claude Max"));
  expect(frame).toContain("▸ Claude Max");
  expect(frame).toContain("  WorkBuddy");
});

/**
 * Inline text nodes ignore a bare `fg` prop, which once painted every bar and provider name
 * white on a light background. Assert on the captured span colors, not on the text.
 */
test("every span carries a theme color", async () => {
  const setup = await render();
  await setup.waitForFrame((value) => value.includes("Claude Max"));

  const allowed = new Set(Object.values(fallbackTheme).map((value) => value.toLowerCase()));
  const painted = coloredSpans(setup);
  expect(painted.length).toBeGreaterThan(10);
  for (const span of painted) {
    expect(allowed.has(hex(span.fg))).toBe(true);
  }

  const title = painted.find((span) => span.text.includes("provider usage"));
  expect(hex(title!.fg)).toBe(fallbackTheme.accent);
  const bar = painted.find((span) => span.text.includes("█"));
  expect(hex(bar!.fg)).toBe(fallbackTheme.green);
  const muted = painted.find((span) => span.text.includes("resets in 2h38m"));
  expect(hex(muted!.fg)).toBe(fallbackTheme.muted);
});

/**
 * The scrollbox used to draw overflowing content over the header line, which reads as a
 * corrupted first row. The popup windows its own lines now; keep it pinned down.
 */
test("the header keeps its own row when the content overflows", async () => {
  const setup = await render(crowded, 14);
  const frame = await setup.waitForFrame((value) => value.includes("Claude Max"));
  const rows = frame.split("\n");

  expect(rows[1]).toContain("provider usage");
  expect(rows[1]).not.toContain("Claude Max");
  expect(rows[2]).toContain("Claude Max");
  expect(rows[2]).not.toContain("provider usage");
  expect(frame).toContain("↑↓ scroll");
  expect(frame).toContain("▼");
});
