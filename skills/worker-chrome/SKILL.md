---
name: worker-chrome
description: When work on a worker needs a browser for anything (load a page, click through a flow, read what rendered, use a site logged in as the user, get past bot checks), use skill. Use it instead of launching Playwright or Puppeteer.
metadata:
  harness: [claude, codex, cursor]
  platform: [linux]
  requires: "npm i -g worker-chrome, then `worker-chrome setup` once per worker"
---

# worker-chrome

Each worker runs one real Google Chrome all the time. It is a normal Chrome window on its own
virtual screen (`:90`). It renders WebGL on the box's real GPU and keeps a persistent profile
that the user logs into by hand. To a website it looks like a person on a Linux desktop at home, not
like a bot. Drive it. Do not launch your own browser.

Playwright's bundled headless Chromium (`chromium.launch()`, `npx playwright`, the `shotter`
install) gets flagged: it reports `HeadlessChrome` and `navigator.webdriver`, has no WebGL, and
starts every session with an empty profile. Only use it when a task deliberately needs a clean,
logged-out browser.

`curl` is still the right tool for a status code, a redirect, or server-rendered HTML.

## Check it is up

```bash
worker-chrome status     # endpoint, Chrome version, the GPU sites see
```

If it is down: `systemctl --user restart worker-chrome`. A missing command means the worker was
never set up: `npm i -g worker-chrome && worker-chrome setup`.

## Which Chrome is which

Every Chrome on a worker is labeled in its window title as `<host> · <name>`. This one is
`<host> · worker-chrome`. To see them all:

```bash
worker-chrome browsers   # each Chrome: label, screen, DevTools port, unit, profile, open tabs
```

Run it before driving any browser you did not start, and to find which one owns a tab. If a task
really needs its own Chrome (a separate profile, a bot, a clean logged-out session), label it
with `--window-name="$(hostname -s) · <name>"`, and in Playwright
`chromium.launch({ args: ["--window-name=<host> · <name>"] })`. An unlabeled Chrome shows up
under its profile directory's name.

Say what a Chrome is for, and `browsers` prints it next to the label. Descriptions live in
`~/.local/share/worker-chrome/descriptions.json`, keyed by name:

```bash
worker-chrome describe my-task "Scrapes X for the Y report, closes when done"
worker-chrome describe my-task      # no text removes it
```

## Drive it

Use `patchright-core`. It has the same API as `playwright-core`, but it does not send the CDP
`Runtime.enable` call that Cloudflare and DataDome detect. It ships inside the worker-chrome
package, so set `NODE_PATH` from it:

```bash
NODE_PATH=$(worker-chrome node-path) node -e '
const { chromium } = require("patchright-core");
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9230");
  const p = await b.contexts()[0].newPage();      // your own tab
  try {
    await p.goto("https://example.com", { waitUntil: "domcontentloaded" });
    console.log(await p.title());
    console.log(await p.locator("main").innerText());
  } finally {
    await p.close();                                // close your tab
    await b.close();                                // disconnects only; Chrome keeps running
  }
})().catch(e => { console.error(e.message); process.exit(1); });
'
```

The rules, all because this browser is shared and logged in as the user:

- **Open your own tab** with `contexts()[0].newPage()` and close it when you are done. Never touch
  tabs you did not open. Other agents may be using them.
- **Never create a new context** (`browser.newContext()`). It starts with no cookies and loses
  the whole point.
- **Never log out, clear cookies or site data, or change Chrome settings.** Those logins took a
  human to set up.
- `b.close()` on a CDP connection only disconnects. Do not kill the Chrome process.
- Do not install Chrome extensions or touch the profile directory (`~/.browser-profiles/worker-chrome`).

The usual Playwright API works: `getByRole`, `getByLabel`, `waitForURL`, `locator().innerText()`,
`p.on("console")`, `p.on("requestfailed")`. Wait for the thing you mean, not `waitForTimeout`.

## When a site needs a login

If the profile is not logged in to the site, stop and tell the user. Never type their
credentials. They log in once themselves by viewing this screen from their laptop:

```bash
screenshare https://site/login   # on the laptop: opens this Chrome over RustDesk, password filled in
```

`screenshare` (npm `screenshare-tunnel`) attaches to worker-chrome whenever it is running, so a
login done there is the login you use. Without it, `worker-chrome view` serves the same screen
over VNC on the Tailscale IP (`worker-chrome view stop` after). Logins stay in the profile across
restarts.

## MCP

Point the `chrome-devtools` MCP at this Chrome with `--browser-url=http://127.0.0.1:9230`
([agent-fleet](https://github.com/Aryan-Saini/agent-fleet)'s `mcp-server-launch` does it
automatically on any worker where worker-chrome is up). The same tab rules apply.

## Report back in text

Nobody is watching this machine. Print what you found. If a picture is the answer, take it from
this browser (`await p.screenshot({ path: "$HOME/drop/<name>.png" })`) and say where it is.

Localhost on the worker is the worker's own localhost. A dev server on the laptop is not reachable
by that name.
