# @forgeai/cli

CLI tools for provisioning and managing Forge assistant instances.

## Installation

This package is used internally by the `vel` CLI. You typically don't need to install it directly.

To run it standalone with [Bun](https://bun.sh):

```bash
bun run ./src/index.ts <command> [options]
```

## Commands

### Lifecycle: `ps`, `sleep`, `wake`

Day-to-day process management for the assistant and gateway.

| Command        | Description                                                                            |
| -------------- | -------------------------------------------------------------------------------------- |
| `forge ps`    | List assistants and per-assistant process status (assistant, gateway PIDs and health). |
| `forge sleep` | Stop assistant and gateway processes. Directory-agnostic — works from anywhere.        |
| `forge wake`  | Start the assistant and gateway from the current checkout.                             |

```bash
# Start everything
forge wake

# Check what's running
forge ps

# Stop everything
forge sleep
```

> **Note:** `forge wake` requires a hatched assistant. Run `forge hatch` first, or launch the macOS app which handles hatching automatically.

### `hatch`

Provision a new assistant instance and bootstrap the Forge runtime on it.

```bash
forge hatch [species] [options]
```

#### Species

| Species    | Description                                       |
| ---------- | ------------------------------------------------- |
| `forge`   | Default. Provisions the Forge assistant runtime. |
| `openclaw` | Provisions the OpenClaw runtime with gateway.     |

#### Options

| Option              | Description                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `-d`                | Detached mode. Start the instance in the background without watching startup progress.               |
| `--name <name>`     | Use a specific instance name instead of an auto-generated one.                                       |
| `--remote <target>` | Where to provision the instance. One of: `local`, `docker`, `forge`, `custom`. Defaults to `local`. |

#### Remote Targets

- **`local`** -- Starts the local assistant and local gateway. Gateway source resolution order is: repo source tree, then installed `@forgeai/forge-gateway` package.
- **`docker`** -- Starts the assistant, gateway, and credential service in Docker containers.
- **`forge`** -- Hatches an assistant on the Forge platform.
- **`custom`** -- Recognized but not yet implemented.

#### Environment Variables

| Variable            | Required For | Description                                                                |
| ------------------- | ------------ | -------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Optional     | Used during setup when no Anthropic API key is already stored or prompted. |

#### Examples

```bash
# Hatch a local assistant (default)
forge hatch

# Hatch a Docker assistant
forge hatch --remote docker

# Hatch with a specific instance name
forge hatch --name my-assistant --remote docker
```

To self-host on a cloud VM (AWS, GCP, or any other provider), SSH into the machine and run `forge hatch` or `forge hatch --remote docker` from inside it. The CLI does not provision cloud instances for you.

### `terminal`

Open an interactive shell into a managed assistant container. Useful for debugging, inspecting state, or working alongside the assistant in a shared `tmux` session.

```bash
forge terminal [name] [options]
forge terminal attach <session> [name] [options]
forge terminal list [name] [options]
```

Only available for managed assistants (those running in a Forge Cloud container). Local assistants don't have a container to terminal into.

#### Subcommands

| Subcommand         | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| _(none)_           | Open an interactive shell session inside the container.            |
| `attach <session>` | Attach to an existing `tmux` session by name inside the container. |
| `list`             | List the `tmux` sessions currently running inside the container.   |

#### Options

| Option               | Description                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `[name]`             | Positional. Name of the assistant to target. Defaults to the active assistant set via `forge use`. |
| `--assistant <name>` | Explicit form of the assistant name. Equivalent to the positional argument.                         |

If no assistant is named and no active assistant is set, the CLI uses the only managed assistant in the lockfile -- or errors out if there's more than one. Use `forge ps` to see your assistants and `forge use <name>` to set the active one.

#### Examples

```bash
# Open a shell in the active managed assistant
forge terminal

# Target a specific assistant by name
forge terminal my-assistant
forge terminal --assistant my-assistant

# List running tmux sessions inside the container
forge terminal list

# Attach to a named tmux session
forge terminal attach my-session
forge terminal attach my-session my-assistant
```

This pairs well with the [`terminal-sessions` skill](https://github.com/forge-ai/forge-assistant/tree/main/skills/terminal-sessions), which lets the assistant create and manage its own `tmux` sessions. You can `forge terminal attach` into one of those sessions to watch the assistant work in real time -- for example, pairing on a long-running Claude Code run.

### `retire`

Delete a provisioned assistant instance. The cloud provider and connection details are automatically resolved from the saved assistant config (written during `hatch`).

```bash
forge retire <name>
```

The CLI looks up the instance by name in the production lockfile (`~/.forge.lock.json`) or the env-scoped lockfile under `$XDG_CONFIG_HOME/forge-<env>/lockfile.json` for non-production environments, then determines how to retire it based on the saved `cloud` field:

- **`gcp`** -- Deletes the GCP Compute Engine instance via `gcloud compute instances delete`.
- **`aws`** -- Terminates the AWS EC2 instance by looking up the instance ID from its Name tag.
- **`local`** -- Stops the local assistant (`forge sleep`) and removes the assistant's instance directory (`resources.instanceDir` in the lockfile; typically `~/.local/share/forge/assistants/<name>/` for new hatches, or `~/.forge/` for legacy entries).
- **`custom`** -- SSHs to the remote host to stop the assistant/gateway and remove the remote `~/.forge` directory.

#### Examples

```bash
# Retire an instance (cloud type resolved from config)
forge retire my-assistant
```
