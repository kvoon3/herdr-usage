import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { For, createMemo, createSignal, onCleanup } from "solid-js";
import { PROVIDERS, type Loaded, type Loader } from "./providers.ts";
import type { Theme } from "./theme.ts";
import { buildRows, keyCommand, relativeTime, toLines, type Cell, type Line, type ProviderRow } from "./view.ts";

const HINTS = "r refresh · a show all · ↑↓ scroll · esc close";

/** Rows the frame spends on chrome: two padding rows, the header, and the hint line. */
const CHROME_ROWS = 5;

/**
 * @opentui/solid types `span` without the TextNodeOptions its renderable takes, so `fg` fails
 * the props type even though the renderable accepts it. Spreading clears the excess-property check.
 */
function paint(fg: string) {
  return { fg };
}

export function App(props: { theme: Theme; load: Loader; close: () => void }) {
  const theme = props.theme;
  const [loaded, setLoaded] = createSignal<Loaded[]>([]);
  const [pending, setPending] = createSignal<ReadonlySet<string>>(new Set(PROVIDERS));
  const [showAll, setShowAll] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  const [scroll, setScroll] = createSignal(0);
  let generation = 0;

  async function refresh() {
    const current = ++generation;
    setLoaded([]);
    setPending(new Set(PROVIDERS));
    setNow(Date.now());
    await props.load(PROVIDERS, (entry) => {
      if (current !== generation) return;
      setNow(Date.now());
      setLoaded((previous) => [...previous.filter((row) => row.id !== entry.id), entry]);
      setPending((previous) => {
        const next = new Set(previous);
        next.delete(entry.id);
        return next;
      });
    });
    if (current === generation) setPending(new Set<string>());
  }
  void refresh();

  // Relative timestamps keep aging while the popup stays open.
  const ticker = setInterval(() => setNow(Date.now()), 30_000);
  (ticker as { unref?: () => void }).unref?.();
  onCleanup(() => clearInterval(ticker));

  const dimensions = useTerminalDimensions();
  const page = createMemo(() => Math.max(1, dimensions().height - CHROME_ROWS));
  const lines = createMemo(() =>
    toLines(
      buildRows(PROVIDERS, loaded(), {
        showAll: showAll(),
        now: now(),
        barWidth: Math.max(8, Math.min(24, dimensions().width - 44)),
        pending: pending(),
      }),
    ),
  );
  const maxScroll = createMemo(() => Math.max(0, lines().length - page()));
  const start = createMemo(() => Math.min(scroll(), maxScroll()));
  const viewport = createMemo(() => lines().slice(start(), start() + page()));
  const indicators = createMemo(() => `${start() > 0 ? "▲" : " "}${start() + viewport().length < lines().length ? "▼" : " "}`);

  function scrollBy(delta: number) {
    setScroll(Math.max(0, Math.min(maxScroll(), start() + delta)));
  }

  const fetchedAt = createMemo(() =>
    loaded().reduce<number | undefined>(
      (oldest, row) => (oldest === undefined || row.snapshot.fetchedAt < oldest ? row.snapshot.fetchedAt : oldest),
      undefined,
    ),
  );
  const header = createMemo(() => {
    const fetched = fetchedAt();
    return [
      `${lines().filter((line) => line.kind === "title").length} providers`,
      fetched === undefined ? "loading…" : relativeTime(fetched, now()),
      showAll() ? "showing all" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  });

  useKeyboard((key) => {
    switch (keyCommand(key.name)) {
      case "close":
        props.close();
        break;
      case "refresh":
        void refresh();
        break;
      case "show-all":
        setShowAll((value) => !value);
        break;
      case "scroll-up":
        scrollBy(-1);
        break;
      case "scroll-down":
        scrollBy(1);
        break;
      case "page-up":
        scrollBy(-page());
        break;
      case "page-down":
        scrollBy(page());
        break;
    }
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.bg}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
    >
      <text>
        <span {...paint(theme.accent)}>
          <b>provider usage</b>
        </span>
        <span {...paint(theme.muted)}> {header()}</span>
      </text>
      <For each={viewport()}>{(line) => <LineRow theme={theme} line={line} />}</For>
      <text {...paint(theme.muted)}>
        {" "}
        {HINTS}
        {indicators().trim() ? `   ${indicators()}` : ""}
      </text>
    </box>
  );
}

function LineRow(props: { theme: Theme; line: Line }) {
  if (props.line.kind === "blank") return <text> </text>;
  if (props.line.kind === "title") return <TitleLine theme={props.theme} row={props.line.row} />;
  return <CellLine theme={props.theme} cell={props.line.cell} />;
}

function TitleLine(props: { theme: Theme; row: ProviderRow }) {
  return (
    <text>
      <span {...paint(props.row.hidden ? props.theme.muted : props.theme.text)}>
        <b>{props.row.name}</b>
      </span>
      <span {...paint(props.theme.muted)}> {props.row.meta}</span>
    </text>
  );
}

function CellLine(props: { theme: Theme; cell: Cell }) {
  return props.cell.kind === "note" ? (
    <text {...paint(props.theme[props.cell.color])}> {props.cell.text}</text>
  ) : props.cell.kind === "money" ? (
    <text>
      <span {...paint(props.theme.muted)}> {props.cell.label} </span>
      <span {...paint(props.theme.text)}>{props.cell.amount}</span>
      <span {...paint(props.theme.muted)}>{props.cell.reset ? `   ${props.cell.reset}` : ""}</span>
    </text>
  ) : (
    <text>
      <span {...paint(props.theme.muted)}> {props.cell.label} </span>
      <span {...paint(props.theme[props.cell.color])}>{props.cell.bar}</span>
      <span {...paint(props.theme[props.cell.color])}>{props.cell.percent}</span>
      <span {...paint(props.theme.muted)}>{props.cell.reset ? `   ${props.cell.reset}` : ""}</span>
    </text>
  );
}
