import { describe, expect, test } from "bun:test";
import type { RateWindow, UsageSnapshot } from "@kvoon/pi-minimal-footer/usage.ts";
import { PROVIDERS, providerName, providerPage, type Loaded } from "../src/providers.ts";
import {
  buildRows,
  clampPercent,
  colorFor,
  keyCommand,
  makeBar,
  moneyCell,
  percentText,
  relativeTime,
  resetText,
  rowLineRange,
  safeError,
  toLines,
} from "../src/view.ts";

const NOW = 1_700_000_000_000;

function snapshot(id: string, windows: RateWindow[], extra: Partial<UsageSnapshot> = {}): Loaded {
  return {
    id,
    name: providerName(id),
    snapshot: { provider: providerName(id), windows, fetchedAt: NOW - 12_000, ...extra },
  };
}

const quota = (label: string, usedPercent: number, resetsIn?: string): RateWindow => ({ label, usedPercent, resetsIn });

describe("bars and colors", () => {
  test("bar fills proportionally and never overflows", () => {
    expect(makeBar(50, 10)).toBe("█████░░░░░");
    expect(makeBar(0, 4)).toBe("░░░░");
    expect(makeBar(100, 4)).toBe("████");
    expect(makeBar(200, 4)).toBe("████");
    expect(makeBar(Number.NaN, 4)).toBe("░░░░");
  });

  test("color thresholds match the pi footer: 70% warn, 90% error", () => {
    expect(colorFor(69.9)).toBe("green");
    expect(colorFor(70)).toBe("yellow");
    expect(colorFor(89.9)).toBe("yellow");
    expect(colorFor(90)).toBe("red");
  });

  test("percent text drops trailing zeros", () => {
    expect(percentText(58.34)).toBe("58.3%");
    expect(percentText(58)).toBe("58%");
    expect(percentText(120)).toBe("100%");
    expect(clampPercent(-5)).toBe(0);
  });

  test("already-reset countdowns are omitted", () => {
    expect(resetText(quota("5h", 10, "2h38m"))).toBe("resets in 2h38m");
    expect(resetText(quota("5h", 10, "0m"))).toBe("");
    expect(resetText(quota("5h", 10))).toBe("");
  });
});

describe("key handling", () => {
  test("only the advertised keys do something", () => {
    expect(keyCommand("escape")).toBe("close");
    expect(keyCommand("q")).toBe("close");
    expect(keyCommand("r")).toBe("refresh");
    expect(keyCommand("a")).toBe("show-all");
    expect(keyCommand("down")).toBe("scroll-down");
    expect(keyCommand("pageup")).toBe("page-up");
    expect(keyCommand("j")).toBe("focus-next");
    expect(keyCommand("k")).toBe("focus-previous");
    expect(keyCommand("return")).toBe("open");
    expect(keyCommand("enter")).toBe("open");
    expect(keyCommand("x")).toBeUndefined();
    expect(keyCommand("tab")).toBeUndefined();
  });
});

describe("provider pages", () => {
  test("every provider has a page except the local gateway", () => {
    for (const id of PROVIDERS) {
      const page = providerPage(id);
      if (id === "workbuddy") {
        expect(page).toBeUndefined();
        continue;
      }
      expect(page).toMatch(/^https:\/\//);
    }
  });
});

describe("relative time", () => {
  test("scales from seconds to days", () => {
    expect(relativeTime(NOW, NOW)).toBe("0s ago");
    expect(relativeTime(NOW - 59_000, NOW)).toBe("59s ago");
    expect(relativeTime(NOW - 12 * 60_000, NOW)).toBe("12m ago");
    expect(relativeTime(NOW - (3 * 3600_000 + 240_000), NOW)).toBe("3h4m ago");
    expect(relativeTime(NOW - 50 * 3600_000, NOW)).toBe("2d ago");
  });
});

describe("balances", () => {
  test("credits render as a dollar pool with failing accounts called out", () => {
    expect(moneyCell("workbuddy", { label: "credits", usedPercent: 0.9, credits: { remain: 1090, size: 1100, accounts: 3, okAccounts: 2 } })).toEqual({
      label: "credits",
      amount: "$1090 / $1100 · 2/3 accounts",
    });
    expect(moneyCell("workbuddy", { label: "credits", usedPercent: 0.9, credits: { remain: 5, size: 0, accounts: 1, okAccounts: 1 } })).toEqual({
      label: "credits",
      amount: "$5",
    });
  });

  test("spend windows format per provider semantics", () => {
    expect(moneyCell("commandcode", { label: "$57.15 spent", usedPercent: 30, money: { currency: "USD", used: 57.15, remaining: 13.01, limit: 70.16 } })).toEqual({
      label: "spent",
      amount: "$57.15 / $70.16",
    });
    expect(moneyCell("openrouter", { label: "$0.54 left", usedPercent: 40, money: { currency: "USD", used: 8, remaining: 0.54, limit: 8.54 } })).toEqual({
      label: "balance",
      amount: "$0.54 left",
    });
    expect(moneyCell("opencode-zen", { label: "$3.05 spent", usedPercent: 0, money: { currency: "USD", used: 3.05 } })).toEqual({
      label: "spent",
      amount: "$3.05 spent / 30d",
    });
    expect(moneyCell("claude", quota("5h", 10))).toBeUndefined();
  });

  test("raw exceptions are redacted", () => {
    expect(safeError("HTTP 429")).toBe("HTTP 429");
    expect(safeError("no-auth")).toBe("no-auth");
    expect(safeError("TimeoutError: fetch failed to https://internal")).toBe("timeout");
    expect(safeError("TypeError: something with a token in it")).toBe("query-failed");
  });
});

describe("rows", () => {
  const options = { showAll: false, now: NOW, barWidth: 10 };
  const ids = ["claude", "codex", "copilot", "workbuddy"];

  test("unauthenticated providers stay hidden until showAll", () => {
    const loaded = [
      snapshot("claude", [quota("5h", 58, "2h38m"), quota("Weekly", 21, "4d2h")]),
      snapshot("codex", [], { error: "no-auth" }),
      snapshot("copilot", [], { error: "no-auth" }),
      snapshot("workbuddy", [{ label: "credits", usedPercent: 0.9, credits: { remain: 1090, size: 1100, accounts: 3, okAccounts: 2 } }]),
    ];
    const rows = buildRows(ids, loaded, options);
    expect(rows.map((row) => row.id)).toEqual(["claude", "workbuddy"]);
    expect(rows[0]!.cells).toEqual([
      { kind: "bar", label: "5h  ", bar: "██████░░░░", percent: "   58%", reset: "resets in 2h38m", color: "green" },
      { kind: "bar", label: "Week", bar: "██░░░░░░░░", percent: "   21%", reset: "resets in 4d2h", color: "green" },
    ]);
    expect(rows[0]!.meta).toBe("12s ago");
    expect(rows[1]!.cells[0]).toMatchObject({ kind: "money", amount: "$1090 / $1100 · 2/3 accounts" });

    const all = buildRows(ids, loaded, { ...options, showAll: true });
    expect(all.map((row) => row.id)).toEqual(ids);
    expect(all[2]!.cells).toEqual([{ kind: "note", text: "Not configured", color: "muted" }]);
    expect(all[2]!.hidden).toBe(true);
  });

  test("providers still loading show a placeholder joined by their pending state", () => {
    const rows = buildRows(["claude"], [snapshot("claude", [quota("5h", 10)])], { ...options, pending: new Set(["claude"]) });
    expect(rows[0]!.meta).toBe("12s ago · refreshing");
    const blank = buildRows(["codex"], [], options);
    expect(blank[0]!.cells).toEqual([{ kind: "note", text: "fetching…", color: "muted" }]);
  });

  test("empty windows explain themselves instead of rendering nothing", () => {
    const rows = buildRows(["opencode-zen"], [snapshot("opencode-zen", [])], options);
    expect(rows[0]!.cells).toEqual([{ kind: "note", text: "No usage data", color: "red" }]);
  });

  test("http failures surface verbatim", () => {
    const rows = buildRows(["claude"], [snapshot("claude", [], { error: "HTTP 429" })], options);
    expect(rows[0]!.cells).toEqual([{ kind: "note", text: "HTTP 429", color: "red" }]);
    expect(rows[0]!.hidden).toBe(false);
  });

  test("lines mark the focused provider and can locate its block", () => {
    const loaded = [
      snapshot("claude", [quota("5h", 10), quota("Week", 20)]),
      snapshot("codex", [quota("5h", 30)]),
      snapshot("workbuddy", [{ label: "credits", usedPercent: 0.9, credits: { remain: 1, size: 2, accounts: 1, okAccounts: 1 } }]),
    ];
    const rows = buildRows(["claude", "codex", "workbuddy"], loaded, options);
    const lines = toLines(rows, "codex");

    expect(lines.map((line) => (line.kind === "title" ? `${line.selected ? "*" : " "}${line.row.id}` : "·"))).toEqual([
      " claude",
      "·",
      "·",
      "·",
      "*codex",
      "·",
      "·",
      " workbuddy",
      "·",
    ]);
    // claude owns 4 lines (title + 2 windows + blank), codex the next 3.
    expect(rowLineRange(rows, 0)).toEqual({ start: 0, end: 2 });
    expect(rowLineRange(rows, 1)).toEqual({ start: 4, end: 5 });
    expect(rowLineRange(rows, 2)).toEqual({ start: 7, end: 8 });
  });

  test("a provider missing from the payload keeps its canonical slot", () => {
    const rows = buildRows(["claude", "codex"], [snapshot("codex", [quota("5h", 5)])], options);
    expect(rows.map((row) => row.id)).toEqual(["claude", "codex"]);
    expect(rows.map((row) => row.name)).toEqual(["Claude Max", "OpenAI Codex"]);
  });
});
