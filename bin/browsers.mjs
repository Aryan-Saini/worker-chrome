// `worker-chrome browsers`: every Chrome/Chromium running on this box, by label, with its
// screen, DevTools port, systemd unit, profile and open tabs. The label is the Chrome's
// --window-name (the convention is "<host> · <name>"), else its unit, else its profile dir.
// Tabs come from the DevTools HTTP list, which never attaches to a page.
import { readFileSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { homedir } from "node:os";

const BROWSERS = new Set(["chrome", "chromium", "chromium-browser", "google-chrome", "headless_shell", "chrome-headless-shell"]);

const read = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

const flag = (argv, name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

// Chrome rewrites its process title to one space-joined string, so split that at each " --".
const argvOf = (pid) => {
  const parts = read(`/proc/${pid}/cmdline`).split("\0").filter(Boolean);
  return parts.length === 1 ? parts[0].split(/ (?=--)/) : parts;
};

// Only browser processes: renderers, the GPU process and the zygotes all carry --type=.
const processes = readdirSync("/proc")
  .filter((pid) => /^\d+$/.test(pid))
  .map((pid) => ({ pid, argv: argvOf(pid) }))
  .filter(({ argv }) => argv.length && BROWSERS.has(basename(argv[0])) && !argv.some((a) => a.startsWith("--type=")));

const tabsOn = async (port) => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
    const targets = /** @type {{ type: string, title: string, url: string }[]} */ (await res.json());
    return targets.filter((t) => t.type === "page");
  } catch {
    return null;
  }
};

// The title rewrite also wipes the browser's own environ, so fall back to its children's.
const displayOf = (pid) => {
  const children = read(`/proc/${pid}/task/${pid}/children`).trim().split(" ").filter(Boolean);
  for (const p of [pid, ...children]) {
    const d = read(`/proc/${p}/environ`).split("\0").find((e) => e.startsWith("DISPLAY="));
    if (d) return d.slice(8);
  }
};

const home = homedir();
const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

for (const { pid, argv } of processes) {
  const display = displayOf(pid);
  const unit = read(`/proc/${pid}/cgroup`).trim().split("/").pop() ?? "";
  const service = unit.endsWith(".service") ? unit : "";
  const profile = flag(argv, "user-data-dir") ?? "";
  const port = flag(argv, "remote-debugging-port");
  const label = flag(argv, "window-name") ?? (service.replace(/\.service$/, "") || basename(profile) || "unlabeled");

  const where = [
    argv.some((a) => a.startsWith("--headless")) ? "headless" : display ?? "-",
    port && port !== "0" ? `cdp ${port}` : argv.includes("--remote-debugging-pipe") ? "cdp pipe" : "no cdp",
    service || `pid ${pid}`,
    profile.replace(home, "~") || "temp profile",
  ];
  console.log(`${label}\n  ${where.join("   ")}`);

  const tabs = port && port !== "0" ? await tabsOn(port) : null;
  for (const t of tabs ?? []) console.log(`    ${short(t.title || "(untitled)", 40).padEnd(40)}  ${short(t.url, 80)}`);
}

if (!processes.length) console.log("no Chrome running");
