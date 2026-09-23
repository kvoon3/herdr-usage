import type { RateWindow, UsageSnapshot } from "@kvoon/pi-minimal-footer/usage.ts";
import { providerName, type Loaded } from "./providers.ts";

export type ColorName = "text" | "muted" | "accent" | "green" | "yellow" | "red";

export interface BarCell {
  kind: "bar";
  label: string;
  bar: string;
  percent: string;
  reset: string;
  color: ColorName;
}

export interface MoneyCell {
  kind: "money";
  label: string;
  amount: string;
  reset: string;
}

/** Provider-level message: a failure, a missing credential, or a pending query. */
export interface NoteCell {
  kind: "note";
  text: string;
  color: ColorName;
}

export type Cell = BarCell | MoneyCell | NoteCell;

export interface ProviderRow {
  id: string;
  name: string;
  meta: string;
  cells: Cell[];
  hidden: boolean;
}

/** A provider with no stored credential: hidden unless the user asks for everything. */
export const NO_AUTH = "no-auth";

/** Do not surface raw exceptions, which can carry URLs or credential-helper output. */
export function safeError(error: string): string {
  if (/^HTTP \d{3}(\/\d{3})?$/.test(error)) return error;
  if (["no-auth", "no-usage-data", "unknown-provider"].includes(error)) return error;
  if (/abort|timeout/i.test(error)) return "timeout";
  return "query-failed";
}

function errorText(error: string): string {
  if (error === NO_AUTH) return "Not configured";
  if (error === "no-usage-data") return "No usage data";
  return error;
}

/** "Weekly" is too wide for a quota label; pi's /usage table calls it "Week". */
export function quotaLabel(window: RateWindow): string {
  return window.label === "Weekly" ? "Week" : window.label;
}

export function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
}

export function colorFor(percent: number): ColorName {
  if (percent >= 90) return "red";
  if (percent >= 70) return "yellow";
  return "green";
}

/** Filled/empty block bar, so a window reads at a glance without font tricks. */
export function makeBar(percent: number, width: number): string {
  const filled = Math.round((clampPercent(percent) / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

export function percentText(percent: number): string {
  return `${Number(clampPercent(percent).toFixed(1))}%`;
}

/** "0m"/"now" countdowns are noise: the window already reset. */
export function resetText(window: RateWindow): string {
  const resetsIn = window.resetsIn;
  return resetsIn && resetsIn !== "0m" && resetsIn !== "now" ? `resets in ${resetsIn}` : "";
}

export function relativeTime(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Balance windows carry money or WorkBuddy credits instead of a percentage. */
export function moneyCell(id: string, window: RateWindow): { label: string; amount: string } | undefined {
  if (window.credits) {
    const { remain, size, accounts, okAccounts } = window.credits;
    const pool = okAccounts < accounts ? ` · ${okAccounts}/${accounts} accounts` : "";
    return { label: "credits", amount: size > 0 ? `$${remain} / $${size}${pool}` : `$${remain}${pool}` };
  }
  if (!window.money) return undefined;
  const { used, remaining, limit } = window.money;
  // Window labels on money windows are whole sentences ("$0.54 left"), so name the amount instead.
  if (id === "commandcode" && limit !== undefined) return { label: "spent", amount: `$${used.toFixed(2)} / $${limit.toFixed(2)}` };
  if (remaining !== undefined) return { label: "balance", amount: `$${remaining.toFixed(2)} left` };
  return { label: "spent", amount: `$${used.toFixed(2)} spent / 30d` };
}

export function isMoneyWindow(window: RateWindow): boolean {
  return Boolean(window.money ?? window.credits);
}

export type Line =
  | { kind: "title"; row: ProviderRow }
  | { kind: "cell"; row: ProviderRow; cell: Cell }
  | { kind: "blank" };

/**
 * Provider blocks flattened to one entry per terminal row. The popup windows this list itself:
 * opentui's scrollbox draws overflowing content over its siblings, header included.
 */
export function toLines(rows: ProviderRow[]): Line[] {
  const lines: Line[] = [];
  rows.forEach((row, index) => {
    if (index > 0) lines.push({ kind: "blank" });
    lines.push({ kind: "title", row });
    for (const cell of row.cells) lines.push({ kind: "cell", row, cell });
  });
  return lines;
}

export type KeyCommand = "close" | "refresh" | "show-all" | "scroll-up" | "scroll-down" | "page-up" | "page-down";

/** Keys the popup answers to; anything else is left to the terminal. */
export function keyCommand(name: string): KeyCommand | undefined {
  switch (name) {
    case "escape":
    case "q":
      return "close";
    case "r":
      return "refresh";
    case "a":
      return "show-all";
    case "up":
      return "scroll-up";
    case "down":
      return "scroll-down";
    case "pageup":
      return "page-up";
    case "pagedown":
      return "page-down";
    default:
      return undefined;
  }
}

export interface BuildOptions {
  showAll: boolean;
  now: number;
  barWidth: number;
  pending?: ReadonlySet<string>;
}

/**
 * One row per provider, in canonical order so nothing jumps while results stream in.
 * Providers without credentials are dropped unless `showAll` asks for them too.
 */
export function buildRows(ids: string[], loaded: Loaded[], options: BuildOptions): ProviderRow[] {
  const byId = new Map(loaded.map((entry) => [entry.id, entry]));
  return ids
    .map((id) => toRow(id, byId.get(id), options))
    .filter((row) => options.showAll || !row.hidden);
}

function toRow(id: string, entry: Loaded | undefined, options: BuildOptions): ProviderRow {
  if (!entry) {
    return { id, name: providerName(id), meta: "", cells: [{ kind: "note", text: "fetching…", color: "muted" }], hidden: false };
  }
  const snapshot: UsageSnapshot = entry.snapshot;
  const error = snapshot.error ? safeError(snapshot.error) : snapshot.windows.length ? "" : "no-usage-data";
  const hidden = error === NO_AUTH;

  const quotaWindows = snapshot.windows.filter((window) => !isMoneyWindow(window));
  const labelWidth = Math.max(0, ...quotaWindows.map((window) => quotaLabel(window).length));
  const cells: Cell[] = [];
  for (const window of quotaWindows) {
    const percent = clampPercent(window.usedPercent);
    cells.push({
      kind: "bar",
      label: quotaLabel(window).padEnd(labelWidth),
      bar: makeBar(percent, options.barWidth),
      percent: percentText(percent).padStart(6),
      reset: resetText(window),
      color: colorFor(percent),
    });
  }
  for (const window of snapshot.windows.filter(isMoneyWindow)) {
    const money = moneyCell(id, window);
    if (money) cells.push({ kind: "money", label: money.label.padEnd(labelWidth), amount: money.amount, reset: resetText(window) });
  }

  if (error) cells.push({ kind: "note", text: errorText(error), color: hidden ? "muted" : "red" });
  if (!cells.length) cells.push({ kind: "note", text: "no windows reported", color: "muted" });

  const meta = [
    snapshot.source,
    relativeTime(snapshot.fetchedAt, options.now),
    options.pending?.has(id) ? "refreshing" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return { id, name: entry.name, meta, cells, hidden };
}
