# endpointforms

The command line for [Endpoint Forms](https://endpointforms.com). Use it to work with your endpoints, form schemas and submissions from a terminal, a script or an AI agent.

```sh
npx endpointforms login
npx endpointforms submissions ls
```

## Log in

```sh
endpointforms login                      # emails you a 6-digit code, then saves a key
endpointforms login --email you@work.com
endpointforms login --key efv2.<id>.<secret>
```

The key is saved to `~/.config/endpointforms/config.json` with mode 0600. `$XDG_CONFIG_HOME` and `$ENDPOINTFORMS_CONFIG_DIR` are respected. The key can read every submission in its workspace, so keep it like a password. If `ENDPOINTFORMS_API_KEY` is set, it takes the place of the saved key.

If an email address has no account yet, logging in with it creates one, along with a workspace.

## Commands

```sh
endpointforms whoami

endpointforms endpoints ls
endpointforms endpoints get <endpoint-id>
endpointforms endpoints create "Demo request"

endpointforms submissions ls [--endpoint <id>] [--origin human,agent] [--verdict won] \
  [--spam flagged] [--from 2026-01-01] [--to 2026-01-31] [--q acme] [--limit 50] [--all]
endpointforms submissions get <submission-id>
endpointforms submissions export [filters] [--format csv|json] [--output leads.csv]

endpointforms form get <endpoint-id> > schema.json
endpointforms form set <endpoint-id> schema.json [--mode warn|strict] [--draft]
cat schema.json | endpointforms form set <endpoint-id> -
```

- Add `--json` to any command for machine-readable output. With `--json`, errors are also written to stderr as JSON.
- `submissions ls` returns one page at a time. Pass `--cursor` to fetch a specific page, or `--all` to follow every page.
- `form get` prints only the schema document, so you can edit the output and pass it straight back to `form set`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | The API refused the request (not found, missing scope, invalid input, network) |
| 2 | Usage error |

## Self-hosting

```sh
endpointforms login --api-url https://forms.example.com
```

You can also set `ENDPOINTFORMS_API_URL`. The CLI only sends a key over HTTPS. Plain HTTP is accepted for `localhost` alone.

The CLI calls the REST API at `/api/v1`, which is described at `/api/v1/openapi.json`. The same operations are available as MCP tools at `/api/mcp`.

License: AGPL-3.0.
