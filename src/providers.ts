import {
  PROVIDER_MAP,
  fetchUsageForProvider,
  type UsageSnapshot,
} from "@kvoon/pi-minimal-footer/usage.ts";

/** Canonical provider order: pi's auth/usage engine tells us which providers exist. */
export const PROVIDERS: string[] = [...new Set(Object.values(PROVIDER_MAP))];

const NAMES: Record<string, string> = {
  claude: "Claude Max",
  codex: "OpenAI Codex",
  copilot: "GitHub Copilot",
  gemini: "Google Gemini",
  minimax: "MiniMax",
  "kimi-coding": "Kimi Coding",
  "zai-coding-cn": "GLM Coding CN",
  commandcode: "CommandCode",
  workbuddy: "WorkBuddy",
  "opencode-go": "OpenCode Go",
  "opencode-zen": "OpenCode Zen",
  openrouter: "OpenRouter",
};

export function providerName(id: string): string {
  return NAMES[id] ?? id;
}

/**
 * Where to look at an account by hand. Best effort: vendor consoles move, and most of these
 * are client-rendered, so a path cannot be verified from here. WorkBuddy has no page at all:
 * it is a local gateway (the one address it answers on, its root, returns 404).
 */
const PAGES: Record<string, string> = {
  claude: "https://claude.ai/settings/usage",
  codex: "https://chatgpt.com/codex/settings/usage",
  copilot: "https://github.com/settings/copilot",
  gemini: "https://aistudio.google.com/usage",
  minimax: "https://platform.minimax.io/user-center/payment/credits",
  "kimi-coding": "https://www.kimi.com/coding",
  "zai-coding-cn": "https://bigmodel.cn/usercenter/proj-mgmt/coding",
  commandcode: "https://commandcode.ai/billing",
  "opencode-go": "https://opencode.ai/zen",
  "opencode-zen": "https://opencode.ai/zen",
  openrouter: "https://openrouter.ai/settings/credits",
};

export function providerPage(id: string): string | undefined {
  return PAGES[id];
}

/** Hands a URL to the platform's opener. Never throws: a missing opener must not kill the popup. */
export function openPage(url: string): void {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" });
  } catch {}
}

export interface Loaded {
  id: string;
  name: string;
  snapshot: UsageSnapshot;
}

/** Queries every provider concurrently, reporting each as it settles. */
export type Loader = (ids: string[], onEach?: (loaded: Loaded) => void) => Promise<Loaded[]>;

export const loadUsage: Loader = async (ids, onEach) =>
  Promise.all(
    ids.map(async (id) => {
      let snapshot: UsageSnapshot;
      try {
        snapshot = await fetchUsageForProvider(id);
      } catch {
        // UsageSnapshot requires a provider label; the view layer redacts the reason.
        snapshot = { provider: providerName(id), windows: [], error: "query-failed", fetchedAt: Date.now() };
      }
      const loaded = { id, name: providerName(id), snapshot };
      onEach?.(loaded);
      return loaded;
    }),
  );
