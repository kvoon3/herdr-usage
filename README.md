# herdr-usage

A [Herdr](https://herdr.dev) plugin that shows the usage behind pi's footer: every provider,
every quota window, at full width.

```
  provider usage 12 providers · 3s ago · showing all
  Claude Max 3s ago
   5h   ████████████░░░░░░░░░░░░   51%   resets in 1h10m
   Week ██░░░░░░░░░░░░░░░░░░░░░░   10%   resets in 5d21h

  CommandCode 0s ago
   5h   ░░░░░░░░░░░░░░░░░░░░░░░░    1%
   Week ░░░░░░░░░░░░░░░░░░░░░░░░  0.9%
   spent $57.15 / $70.16

  OpenRouter 1s ago
   balance $0.54 left
```

## Install

```bash
herdr plugin install kvoon3/herdr-usage
```

Then bind a key in `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "prefix+u"
type = "shell"
command = "\"$HERDR_BIN_PATH\" plugin pane open --plugin kvoon.herdr-usage --entrypoint usage"
description = "Open usage"
```

Reload Herdr's config (`prefix+shift+r`) and press `prefix+u`.

## What it shows

- One block per provider, one line per quota window: progress bar, used percentage, and the
  time until that window resets. Nothing is truncated or collapsed — that is the point.
- Balances instead of percentages where a provider has no window: CommandCode spend,
  OpenRouter credit, WorkBuddy gateway credits (`$remain / $size · n/m accounts`), OpenCode's
  local `$` estimates.
- Failures verbatim per provider (`HTTP 429`, `timeout`, `query-failed`), redacted the same way
  pi's own `/usage` redacts them.
- Providers without a stored credential stay hidden until you ask for them.

| Key | Action |
| --- | --- |
| `r` | refresh every provider now |
| `a` | show providers without credentials too |
| `↑` `↓` `PgUp` `PgDn` | scroll |
| `Esc` `q` | close |

Usage is fetched once when the popup opens, then only on `r`. The popup is a glance, and the pi
footer already polls every five minutes; a second timer would only double the request rate.

## Where the numbers come from

They are the same numbers the footer shows, from the same code: the plugin imports
`usage.ts` from [`@kvoon/pi-minimal-footer`](https://www.npmjs.com/package/@kvoon/pi-minimal-footer)
and reads credentials from `~/.pi/agent/auth.json` (and the standard provider env vars) exactly
as pi does — read-only, no logins, no token refresh, nothing written back. Providers without
credentials are skipped rather than reported as errors.

`@kvoon/pi-minimal-footer/usage.ts` is a public sub-path of that package; that is the contract
this plugin is built on.

## Notes

- Colors follow Herdr's own theme: `theme.auto_switch`, `theme.light_name`/`dark_name`, and the
  `[theme.custom]` / `[theme.custom.light|dark]` token overrides are read from
  `config.toml` (or `$HERDR_CONFIG_PATH`). Stock built-in themes without custom tokens fall
  back to the Catppuccin default palette.
- It renders in a popup pane, so it needs no pane context: usage is account-wide.

## Development

```bash
bun install          # needs @kvoon/pi-minimal-footer >= 0.4.3 on npm
bun test             # pure view model + headless render tests
bun run typecheck
bun run src/main.tsx # run the TUI in any pane
```

While changing the footer's `usage.ts`, link it instead of republishing:

```bash
cd ../pi-extensions/pi-minimal-footer && bun link
cd ~/i/herdr-usage && bun link @kvoon/pi-minimal-footer
```

Link the working tree into Herdr and try it without publishing:

```bash
herdr plugin link ~/i/herdr-usage
```

`src/view.ts` holds the whole view model (bars, colors, amounts, rows, key map) with no opentui
imports, so it is tested directly; `test/app.test.tsx` renders the real component headlessly and
asserts on captured frames.

## License

MIT
