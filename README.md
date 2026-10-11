# worker-chrome

One real Google Chrome that runs all the time on a headless Linux box, for AI agents to drive.

Agents on a server usually launch Playwright's bundled headless Chromium. Sites spot it at once:
it says `HeadlessChrome`, sets `navigator.webdriver`, has no WebGL, and starts every run logged
out. worker-chrome is a normal Chrome window on its own virtual screen instead. It renders on
the box's real GPU, keeps one persistent profile you log into by hand, and exposes DevTools on
`127.0.0.1` only. To a website it looks like a person at a Linux desktop.

```bash
npm i -g worker-chrome
worker-chrome setup      # systemd user units for Xvfb :90, openbox and Chrome; starts them
worker-chrome status     # endpoint, Chrome's user agent, the GPU sites see, webdriver=false
```

## Drive it

Connect over CDP with [patchright-core](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright),
the Playwright API without the `Runtime.enable` call bot checks look for. It ships with this
package:

```js
// NODE_PATH=$(worker-chrome node-path) node drive.js
const { chromium } = require("patchright-core");
const b = await chromium.connectOverCDP("http://127.0.0.1:9230");
const p = await b.contexts()[0].newPage();   // your own tab in the shared, logged-in profile
await p.goto("https://example.com");
await p.close(); await b.close();            // close disconnects; Chrome keeps running
```

The `chrome-devtools` MCP works too: `--browser-url=http://127.0.0.1:9230`.

`skills/worker-chrome/SKILL.md` is the agent skill: open your own tab, never a new context, never
log out or clear data. Link it into your harness:

```bash
ln -s "$(npm root -g)/worker-chrome/skills/worker-chrome" ~/.claude/skills/
```

## Logging in

The profile is only useful once you've signed in to the sites your agents need. From your laptop,
[`screenshare`](https://github.com/Aryan-Saini/screenshare-tunnel) opens this exact screen over
RustDesk, already authenticated. Fallback on the box itself: `worker-chrome view` serves it over
VNC on the Tailscale IP only.

## Requirements

Linux with systemd user services (and lingering, so it starts at boot without a login),
`google-chrome-stable`, Xvfb, openbox, Node 20+. A GPU at `/dev/dri/renderD128` turns on WebGL
through Vulkan; without one Chrome still runs, minus WebGL.

| setting | default | |
| --- | --- | --- |
| `WORKER_CHROME_DISPLAY` | `90` | X display number, read at `setup` |
| `WORKER_CHROME_PORT` | `9230` | DevTools port, `127.0.0.1` only |

Profile: `~/.browser-profiles/worker-chrome`. Update with `npm i -g worker-chrome@latest`, then
`worker-chrome restart`.

## License

[MIT](LICENSE). Built by [Aryan Saini](https://github.com/Aryan-Saini) as part of
[agent-fleet](https://github.com/Aryan-Saini/agent-fleet).
