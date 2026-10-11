# worker-chrome

**This repo is public and published to npm as `worker-chrome`.** Everything under `bin/` and
`skills/` is downloaded by anyone who runs `npm i -g worker-chrome`.

Never commit hostnames, tailnet IPs, usernames, profile contents or anything from a real
machine. The profile (`~/.browser-profiles/worker-chrome`) holds real logins and never leaves the
box. Git history counts: check `git diff --cached` before every commit, not after.

- `bin/worker-chrome` is the whole tool: bash that writes systemd user units and launches Chrome.
  `bash -n` and `shellcheck -S warning` must pass.
- `skills/worker-chrome/SKILL.md` is the agent skill. Keep its commands in sync with the script's
  usage comment.
- `screenshare-tunnel` attaches to this through `worker-chrome endpoint` and `worker-chrome
  display`. Changing either output breaks it.
- Release: bump `version` in `package.json` in the same PR, then `npm pack --dry-run`,
  `npm publish`, tag `v<version>`.
