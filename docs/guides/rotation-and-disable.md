# Rotation, disable, key hygiene

## Rotate a secret

`set` again:

```bash
onenv set aws AWS_SECRET_KEY
# enter new value at prompt
```

Overwrites existing item. 1Password keeps version history — view past values in desktop app.

After rotating in `onenv`, rotate at source (AWS, Stripe, etc.) and revoke old credential there.

## Disable vs unset

| Command | Effect | Recoverable |
|---------|--------|-------------|
| `onenv disable <ns> <key>` | Skipped by `run`, `export`, and the agent API's `/v1/env/export`. Item stays in 1Password. `onenv list` still shows the key, marked `disabled:true`. | Yes — `onenv enable` |
| `onenv unset <ns> <key>` | Deletes 1Password item. | Only via 1Password deleted-items recovery (~30 days) |

Default: `disable` when unsure. Use `unset` only when certain + secret revoked at source.

## State file

Disabled keys tracked at:

```
~/.config/onenv-manager/state.json
```

(Or `$XDG_CONFIG_HOME/onenv-manager/state.json`.)

Format:

```json
{
  "version": 1,
  "disabled": {
    "aws": ["OLD_KEY"]
  }
}
```

Delete file to reset all disable flags.

## Bulk disable a namespace

```bash
for k in $(onenv list aws --json | jq -r '.[].key'); do
  onenv disable aws "$k"
done
```

(JSON output kicks in automatically when stdout is piped; `--json` makes it explicit.)

## Key hygiene checklist

- Rotate quarterly or after team member leaves.
- Disable > delete when in doubt.
- Namespaces scope blast radius — one compromised key won't expose unrelated services.
- Review `onenv list` periodically; unset dead keys.
- Shared keys: document access in 1Password item notes.