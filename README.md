# OLMA

**OpenCode Local Model Assistant** — A TUI for managing local and LAN LLM providers in OpenCode.

## What it does

OLMA makes it easy to discover, configure, and manage local or LAN-based LLM providers (like [oMLX](https://github.com/ninetained/mLX), llama.cpp server, LM Studio, etc.) from within a terminal UI.

- **Discover models** from any OpenAI-compatible API endpoint (`GET /v1/models`)
- **Add/edit providers** — configure `baseURL`, `apiKey`, NPM package, and display name
- **Add/remove models** — sync discovered models into your `opencode.json` config
- **Save & backup** — writes to `~/.config/opencode/opencode.json` with automatic backups
- **Environment variables** — manage `.env` files for API keys using `{env:VAR_NAME}` references

## Install

```bash
bun install
bun run dev
```

Or build a standalone binary:

```bash
bun run build
./olma
```

## Usage

```
olma
```

### Keybindings

| Key | Action |
|-----|--------|
| `p` | Manage Providers |
| `d` | Discover Models from endpoint |
| `e` | Edit Environment Variables (.env) |
| `s` | Save config to `opencode.json` |
| `q` / `Ctrl+C` / `Esc` | Quit |
| `↑/↓` | Navigate lists |
| `Enter` | Select / toggle |
| `a` | Add new item |
| `e` | Edit selected item |
| `r` | Refresh / rediscover |
| `Tab` | Cycle form fields |

### Supported config formats

OLMA works with the `provider` section of `opencode.json` (v1 format):

```json
{
  "provider": {
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "oMLX Local LAN Provider",
      "options": {
        "baseURL": "http://red-terminal.lan:8000/v1",
        "apiKey": "dummy-key"
      },
      "models": {
        "Muse-Glimmer-30B-8bit": {
          "id": "Muse-Glimmer-30B-8bit",
          "name": "Muse-Glimmer-30B-8bit",
          "tools": true
        }
      }
    }
  }
}
```

## Project Structure

```
src/
  index.tsx          # Entry point — launches the TUI
  types.ts           # TypeScript interfaces (config, models, app state)
  config.ts          # Load/save opencode.json with JSONC support + backups
  api.ts             # OpenAI-compatible API client (model discovery + health check)
  ui/
    App.tsx          # Root component — state management & screen routing
    HomeScreen.tsx   # Dashboard — providers overview + quick actions
    ProvidersScreen.tsx  # List/add/edit/delete providers + model discovery
    ModelsScreen.tsx     # Discovered models — add/remove from config
    EnvScreen.tsx        # .env file editor — manage env vars for API keys
```
