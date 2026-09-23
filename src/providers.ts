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
