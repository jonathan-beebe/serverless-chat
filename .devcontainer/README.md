# `.devcontainer` — Dockerized Claude Code sandbox

A containerized environment for running Claude Code against this repo with
**permissive permissions** but **strict containment**.

## Why this exists

Three goals:

1. **Account isolation.** The container's Claude Code session uses a separate
   Anthropic account from your host machine. Auth lives in a Docker named
   volume, never on the host filesystem.
2. **Permissive Claude.** `claude` runs with `--dangerously-skip-permissions`
   inside the container. No prompt-per-write. Containment comes from the
   sandbox, not from prompts.
3. **Tight blast radius.** Claude can only write to this repo (bind mount) and
   only reach an allowlist of network endpoints (iptables firewall). Everything
   else is off-limits.

## The containment model

| Surface        | What Claude can touch                                                     | How it's enforced                                                                                     |
| -------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Filesystem** | This repo only, at `/workspace`                                           | Bind mount of `${localWorkspaceFolder}`; nothing else from the host is mounted                        |
| **Network**    | Anthropic API, npm, GitHub, VS Code marketplace, Sentry/Statsig telemetry | `init-firewall.sh` builds an iptables allowlist; default policy is DROP                               |
| **Auth**       | Container's own `~/.claude` (a Docker volume)                             | Volume `claude-code-config-${devcontainerId}` is project-scoped and never crosses to host `~/.claude` |
| **Privileges** | Non-root `node` user                                                      | `remoteUser: node`; sudo only for `init-firewall.sh`                                                  |

What's **not** mounted: `~/.ssh`, `~/.config/gh`, any host env vars, host
`~/.claude`. The container is fresh: you log in once per devcontainer rebuild,
and only with the personal account you choose.

## For humans

### One-time setup

```bash
brew install --cask docker            # Docker Desktop
npm install -g @devcontainers/cli     # standalone devcontainer CLI
```

Start Docker Desktop before the first build.

### Daily use (terminal)

From the repo root:

```bash
# Build (first time) or start the container
devcontainer up --workspace-folder .

# Drop into a shell inside the container
devcontainer exec --workspace-folder . zsh
```

#### First-time login (one-time, per fresh volume)

The `claude` command in this container is aliased to
`claude --dangerously-skip-permissions`. That flag is meant for unattended use
and **suppresses the interactive `/login`** slash command — so if you launch the
aliased `claude` first, you'll see `/login isn't available in this environment`.

Bypass the alias for the initial login:

```bash
\claude           # leading backslash skips the alias for this one invocation
# (equivalents: `command claude`, or `unalias claude && claude`)
```

In that bare session, run `/login` and complete the browser OAuth with your
personal account. If the browser callback doesn't reach the container (a
port-forwarding quirk), Claude shows a `Paste code here if prompted` field —
copy the code from the browser and paste it there.

After login completes, exit. The token is now stored in the
`claude-code-config-${devcontainerId}` Docker volume. From that point on, plain
`claude` (aliased, permissive) just works:

```bash
claude            # uses cached token; no login flow
```

To confirm account isolation:

```bash
# Inside the container
claude /status  # should show your personal account email

# On the host (separate terminal)
claude /status  # should show your normal/work account — unchanged
```

### Daily use (VS Code)

1. Open the repo in VS Code.
2. Accept the "Reopen in Container" prompt (or run **Dev Containers: Reopen in
   Container** from the command palette).
3. The Claude Code VS Code extension is preinstalled in the container. Use it
   from the panel, or open an integrated terminal and run `claude`.

Both paths (CLI and VS Code) use the same container and the same auth volume.

### Running the app

```bash
# Inside the container
npm run dev     # Vite at :5173, forwarded to host
```

Open `http://localhost:5173` on your host. The PWA hot-reloads against your
local file edits.

### Rebuilding

When you change `Dockerfile` or `devcontainer.json`:

```bash
devcontainer up --workspace-folder . --remove-existing-container
```

VS Code: **Dev Containers: Rebuild Container**.

The Claude auth volume **survives rebuilds** — you won't have to log in again.
To force a clean auth state:

```bash
docker volume rm claude-code-config-<devcontainerId>
```

(Find the exact name with `docker volume ls | grep claude`.)

## For Claude (running inside the container)

If you are Claude Code running inside this devcontainer, here is your situation:

- **You are sandboxed.** You are running as `node` (non-root) inside a Docker
  container. You were launched with `--dangerously-skip-permissions`, so you
  will not be prompted to confirm writes. **This does not mean you have no
  guardrails** — it means the guardrails moved to the sandbox boundary. Behave
  as if writes are still consequential within this repo.
- **Your filesystem.** Only `/workspace` is bind-mounted from the host. Anything
  you write there appears in the user's real repo. Anything outside `/workspace`
  is ephemeral container state and will not persist.
- **Your network is restricted by allowlist.** You can reach:
  - `api.anthropic.com` (your own API, for Claude)
  - `registry.npmjs.org` (`npm install`)
  - GitHub's IP ranges (`gh`, `git push/pull`, GitHub API)
  - VS Code marketplace and update servers
  - Sentry and Statsig telemetry
  - LAN hosts on the Docker bridge network
  - Anything else returns `connection refused` / `icmp-admin-prohibited`. If you
    see those errors, the firewall is doing its job. Tell the user — don't try
    to work around it. Adding a domain means editing
    `.devcontainer/init-firewall.sh`.
- **Auth lives in a Docker volume.** Your `~/.claude` is mounted as a named
  volume, scoped to this devcontainer. Treat its contents as sensitive.
- **The host is offline-by-design for this app.** All plant data is bundled JSON
  in `src/data/seed/`. You should never need to fetch external data at runtime.
  If something seems to require network, double-check the data layer in
  `src/data/db.ts` and `src/data/api.ts`.
- **`sudo` is available for one thing only:** running
  `/usr/local/bin/init-firewall.sh`. Do not assume general root access.
- **Node version is 22** (matches the project's `.nvmrc`). Use `npm`, not yarn
  or pnpm.

Refer to the repo root `CLAUDE.md` for project-specific conventions (testing
discipline, TDD-on-refactor, no `!` non-null assertions, etc.).

## Files in this directory

| File                | Purpose                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `Dockerfile`        | Node 22 base + dev tools + zsh + Claude Code CLI + sudoers entry for the firewall script |
| `devcontainer.json` | Mounts, capabilities, env, VS Code extensions, lifecycle hooks                           |
| `init-firewall.sh`  | Builds the iptables allowlist; runs on every container start via `postStartCommand`      |
| `README.md`         | This file                                                                                |

## Caveats and known sharp edges

- **`node_modules` is shared between host and container** via the bind mount. If
  you run `npm install` on the host (darwin/arm64) and then in the container
  (linux), native binaries (esbuild, etc.) may rebuild on each switch. Pick one
  side and stick with it, or accept the occasional reinstall. To eliminate this,
  add a named volume at `/workspace/node_modules` in `devcontainer.json` — left
  out for spike simplicity.
- **First build is slow** (~5–10 min): apt installs, zsh-in-docker download,
  `git-delta`, `npm install -g claude-code`, then `npm install` for the repo.
  Subsequent starts are seconds.
- **Firewall verification can fail loudly** at container start if Docker DNS is
  in a weird state on macOS. Restart Docker Desktop if you see "Firewall
  verification failed". The container will not be usable until the script exits
  clean.
- **The firewall does not block SSH outbound.** Port 22 is allowed for
  convenience (git over SSH). If you want it locked down, edit
  `init-firewall.sh`.
- **No MCP servers are wired up.** If you want MCP inside the container, add a
  `.mcp.json` at the repo root and add the server's domains to the firewall
  allowlist.

## Adding a domain to the allowlist

Edit `init-firewall.sh`, add the hostname to the `for domain in \` block, then
rebuild. Example: adding the Figma API:

```sh
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "api.figma.com" \         # ← new
    ...
```

```bash
devcontainer up --workspace-folder . --remove-existing-container
```
