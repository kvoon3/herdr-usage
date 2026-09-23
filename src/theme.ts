import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Colors the popup paints with, all resolved from Herdr's own theme tokens. */
export interface Theme {
  bg: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  green: string;
  yellow: string;
  red: string;
}

/** Catppuccin mocha, the palette Herdr itself falls back to. */
export const fallbackTheme: Theme = {
  bg: "#1e1e2e",
  panel: "#313244",
  text: "#cdd6f4",
  muted: "#6c7086",
  accent: "#89b4fa",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  red: "#f38ba8",
};

/** Herdr theme tokens to try, in order, for each color we paint. */
const TOKENS: ReadonlyArray<readonly [keyof Theme, readonly string[]]> = [
  ["bg", ["bg", "background", "panel_bg"]],
  ["panel", ["panel", "surface0"]],
  ["text", ["text"]],
  ["muted", ["overlay1", "subtext0", "overlay0"]],
  ["accent", ["accent", "blue", "mauve"]],
  ["green", ["green"]],
  ["yellow", ["yellow", "peach"]],
  ["red", ["red"]],
];

function readAppleInterfaceStyle(): string {
  try {
    return execFileSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // The key is absent in light mode.
    return "";
  }
}

/** macOS reports dark mode through a defaults key that only exists in dark mode. */
export function isHostLight(
  platform = process.platform,
  read: () => string = readAppleInterfaceStyle,
): boolean {
  return platform === "darwin" ? read() !== "Dark" : false;
}

/**
 * Herdr owns the theme but does not hand it to plugin panes, so resolve it the way Herdr
 * does: `[theme]` names the palette, `[theme.custom]` overrides tokens, and `auto_switch`
 * layers the matching `[theme.custom.light|dark]` block on top.
 */
export function resolveTheme(
  configPath = process.env.HERDR_CONFIG_PATH ?? `${process.env.HOME}/.config/herdr/config.toml`,
  hostLight = isHostLight(),
): Theme {
  let doc: Record<string, any>;
  try {
    doc = Bun.TOML.parse(readFileSync(configPath, "utf8")) as Record<string, any>;
  } catch {
    return fallbackTheme;
  }
  const theme = doc?.theme;
  if (!theme || typeof theme !== "object") return fallbackTheme;
  const custom = theme.custom ?? {};
  const mode = theme.auto_switch === true ? (hostLight ? custom.light : custom.dark) : undefined;
  const tokens: Record<string, unknown> = { ...custom, ...mode };
  const resolved = { ...fallbackTheme };
  for (const [key, names] of TOKENS) {
    for (const name of names) {
      if (typeof tokens[name] === "string") {
        resolved[key] = tokens[name] as string;
        break;
      }
    }
  }
  return resolved;
}
