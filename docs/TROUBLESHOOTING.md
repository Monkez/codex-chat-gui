# Troubleshooting

## Model requires a newer Codex runtime

Typical messages:

- `The model requires a newer version of Codex.`
- `failed to load models cache: unknown variant max`

Both messages mean the local Codex CLI/SDK is older than the model catalog returned by the service. They are compatibility errors, not prompt or account errors.

### Windows recovery

1. Stop the currently running Codex Chat UI window.
2. Run `run.bat` again.
3. If the automatic update cannot complete, run `setup.bat`, then run `run.bat`.

The launcher validates the installed `@openai/codex-sdk` version before starting. When it is missing or older than the version required by `package.json`, it installs the project dependencies and starts only after the runtime is compatible.

### Cross-platform recovery

```bash
npm install
npm run dev
```

To inspect the installed runtime versions:

```bash
node scripts/runtime-compat.mjs
npx codex --version
```

The Settings panel in the app also shows the active local Codex runtime version.

## Keeping the runtime current

When adding a model that needs a newer Codex release, update `@openai/codex-sdk` in `package.json` and commit both `package.json` and `package-lock.json`. The startup guard will then update older working copies automatically.
