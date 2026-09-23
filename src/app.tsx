import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { For, createMemo, createSignal, onCleanup } from "solid-js";
import { PROVIDERS, openPage, providerPage, type Loaded, type Loader } from "./providers.ts";
import type { Theme } from "./theme.ts";
import { NO_AUTH, buildRows, keyCommand, relativeTime, rowLineRange, toLines, type Cell, type Line, type ProviderRow } from "./view.ts";

const HINTS_TAIL = "j/k focus · ↵ open · ↑↓ scroll · esc close";

/** Rows the frame spends on chrome: two padding rows, the header, and the hint line. */
const CHROME_ROWS = 5;

/**
 * Inline text nodes only take color through `style`: the solid reconciler drops a bare `fg`
 * prop on `span`/`b`/`i` silently, which paints them white. It also types those props away,
 * so the spread keeps the workaround in one place.
 */
function paint(fg: string) {
  return { style: { fg } };
}

export function App(props: { theme: Theme; load: Loader; close: () => void }) {
  const theme = props.theme;
  const [loaded, setLoaded] = createSignal<Loaded[]>([]);
  const [pending, setPending] = createSignal<ReadonlySet<string>>(new Set(PROVIDERS));
  const [showAll, setShowAll] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  const [scroll, setScroll] = createSignal(0);
  const [focused, setFocused] = createSignal(0);
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
  const rows = createMemo(() =>
    buildRows(PROVIDERS, loaded(), {
      showAll: showAll(),
      now: now(),
      barWidth: Math.max(8, Math.min(24, dimensions().width - 44)),
      pending: pending(),
    }),
  );
  const focusIndex = createMemo(() => Math.min(focused(), Math.max(0, rows().length - 1)));
  const focusedRow = createMemo(() => rows()[focusIndex()]);
  const lines = createMemo(() => toLines(rows(), focusedRow()?.id));
  const maxScroll = createMemo(() => Math.max(0, lines().length - page()));
  const start = createMemo(() => Math.min(scroll(), maxScroll()));
  const viewport = createMemo(() => lines().slice(start(), start() + page()));
  const indicators = createMemo(() => `${start() > 0 ? "▲" : " "}${start() + viewport().length < lines().length ? "▼" : " "}`);

  function scrollBy(delta: number) {
    setScroll(Math.max(0, Math.min(maxScroll(), start() + delta)));
  }

  /** j/k walk the providers; the view follows so the focused block is always on screen. */
  function focusBy(delta: number) {
    const next = Math.max(0, Math.min(rows().length - 1, focusIndex() + delta));
    setFocused(next);
    const { start: first, end: last } = rowLineRange(rows(), next);
    if (first < start()) setScroll(first);
    else if (last > start() + page() - 1) setScroll(Math.min(maxScroll(), last - page() + 1));
  }

  function openFocused() {
    const page = focusedRow() && providerPage(focusedRow()!.id);
    if (page) openPage(page);
  }

  const fetchedAt = createMemo(() =>
    loaded().reduce<number | undefined>(
      (oldest, row) => (oldest === undefined || row.snapshot.fetchedAt < oldest ? row.snapshot.fetchedAt : oldest),
      undefined,
    ),
  );
  const header = createMemo(() => {
    const fetched = fetchedAt();
    // Say what is hidden, so `a` is discoverable without a wall of "Not configured" rows.
    const unconfigured = loaded().filter((entry) => entry.snapshot.error === NO_AUTH).length;
    return [
      `${lines().filter((line) => line.kind === "title").length} providers`,
      !showAll() && unconfigured ? `${unconfigured} unconfigured` : "",
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
      case "focus-next":
        focusBy(1);
        break;
      case "focus-previous":
        focusBy(-1);
        break;
      case "open":
        openFocused();
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
        {`r refresh · a ${showAll() ? "hide empty" : "show all"} · ${HINTS_TAIL}`}
        {indicators().trim() ? `   ${indicators()}` : ""}
      </text>
    </box>
  );
}

function LineRow(props: { theme: Theme; line: Line }) {
  if (props.line.kind === "blank") return <text> </text>;
  if (props.line.kind === "title") return <TitleLine theme={props.theme} row={props.line.row} selected={props.line.selected} />;
  return <CellLine theme={props.theme} cell={props.line.cell} />;
}

function TitleLine(props: { theme: Theme; row: ProviderRow; selected: boolean }) {
  const name = () => (props.selected ? props.theme.accent : props.row.hidden ? props.theme.muted : props.theme.text);
  return (
    <text>
      <span {...paint(props.selected ? props.theme.accent : props.theme.muted)}>{props.selected ? "▸ " : "  "}</span>
      <span {...paint(name())}>
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
