// `worker-chrome forward`: serves Chrome's DevTools port (127.0.0.1:<port>) on specific
// addresses, such as the box's Tailscale IP, to an allowlist of source addresses. It is a plain
// TCP relay run by worker-chrome-expose.service, so HTTP and the CDP websocket both pass through.
//
//   node forward.mjs check <port> <binds> <allow>   validate only, exit 1 with a reason
//   node forward.mjs serve <port> <binds> <allow>   run the relay
//
// <binds> and <allow> are comma or space separated. Binds must be concrete IP addresses: the
// wildcards 0.0.0.0 and :: are refused, since a logged-in browser on a public address is an
// account takeover. Allow entries are IPs or CIDRs. Loopback and the bind addresses themselves
// are always allowed (the box can already reach 127.0.0.1).
import { BlockList, connect, createServer, isIP } from "node:net";

const [mode, portArg, bindArg = "", allowArg = ""] = process.argv.slice(2);
const list = (s) => s.split(/[\s,]+/).filter(Boolean);

/** @returns {{ port: number, binds: string[], allow: BlockList, allowed: string[] }} */
const parse = () => {
  const port = Number(portArg);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`bad port: ${portArg}`);

  const binds = list(bindArg);
  if (!binds.length) throw new Error("no bind address given");
  const wildcard = new BlockList();
  wildcard.addAddress("0.0.0.0");
  wildcard.addAddress("::", "ipv6");
  const loopback = new BlockList();
  loopback.addSubnet("127.0.0.0", 8);
  loopback.addAddress("::1", "ipv6");
  for (const b of binds) {
    const family = isIP(b) === 6 ? "ipv6" : "ipv4";
    if (!isIP(b)) throw new Error(`bind must be an IP address, not ${b}`);
    if (wildcard.check(b, family) || /^::ffff:/i.test(b))
      throw new Error(`refusing to bind ${b}: it would expose Chrome on every interface`);
    if (loopback.check(b, family)) throw new Error(`${b} is loopback; Chrome already listens there`);
  }

  const allowed = list(allowArg);
  if (!allowed.length) throw new Error("no allowed source address given");
  const allow = new BlockList();
  for (const a of [...allowed, "127.0.0.1", "::1", ...binds]) {
    const [ip, bits] = a.split("/");
    const family = isIP(ip) === 6 ? "ipv6" : isIP(ip) === 4 ? "ipv4" : null;
    if (!family) throw new Error(`allow entries must be IPs or CIDRs, not ${a}`);
    if (bits === undefined) allow.addAddress(ip, family);
    else {
      const prefix = Number(bits);
      if (!Number.isInteger(prefix) || prefix < 8 || prefix > (family === "ipv4" ? 32 : 128))
        throw new Error(`bad prefix in ${a}: use /8 to /${family === "ipv4" ? 32 : 128}`);
      allow.addSubnet(ip, prefix, family);
    }
  }
  return { port, binds, allow, allowed };
};

let cfg;
try {
  cfg = parse();
} catch (e) {
  console.error(`worker-chrome expose: ${e.message}`);
  process.exit(1);
}
if (mode === "check") process.exit(0);
if (mode !== "serve") {
  console.error("usage: node forward.mjs check|serve <port> <binds> <allow>");
  process.exit(2);
}

const { port, binds, allow, allowed } = cfg;
// IPv4 clients of a dual-stack socket show up as ::ffff:a.b.c.d.
const source = (addr = "") => addr.replace(/^::ffff:(?=\d+\.)/, "");

for (const host of binds) {
  const server = createServer((client) => {
    const from = source(client.remoteAddress);
    if (!allow.check(from, isIP(from) === 6 ? "ipv6" : "ipv4")) {
      console.error(`refused ${from} on ${host}:${port}`);
      client.destroy();
      return;
    }
    const chrome = connect({ host: "127.0.0.1", port });
    client.setNoDelay(true);
    chrome.setNoDelay(true);
    client.pipe(chrome).pipe(client);
    const done = () => {
      client.destroy();
      chrome.destroy();
    };
    client.on("error", done).on("close", done);
    chrome.on("error", done).on("close", done);
  });
  // A missing address (Tailscale not up yet at boot) exits, and systemd retries.
  server.on("error", (e) => {
    console.error(`cannot listen on ${host}:${port}: ${e.message}`);
    process.exit(1);
  });
  server.listen({ host, port, ipv6Only: isIP(host) === 6 }, () =>
    console.error(`serving 127.0.0.1:${port} on ${host}:${port} to ${allowed.join(", ")} (and loopback)`),
  );
}
