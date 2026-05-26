<script lang="ts">
  const REPO_URL = 'https://github.com/doublej/onenv';
  const INSTALL = 'git clone https://github.com/doublej/onenv && cd onenv && bun install.ts';

  const features = [
    {
      title: '.env replacement',
      description:
        'Same KEY=value ergonomics. Values live in a 1Password vault instead of a file on disk.',
    },
    {
      title: 'onenv run -- <cmd>',
      description:
        'Reads the project’s .onenv.json, fetches enabled secrets, injects them as env vars, execs the command. Secrets exist only in the child process.',
    },
    {
      title: 'Pipeable writes',
      description:
        'onenv set <ns> <KEY> --value-stdin reads the secret from stdin instead of an interactive prompt. Chain with op read, pbpaste, or aws ssm get-parameter; the value does not enter shell history.',
    },
    {
      title: 'Drift detection',
      description:
        'onenv check compares process.env against the project’s stored secrets via SHA-256 fingerprints. Reports match / differ / missing / shell-only and exits non-zero on drift. Values are never printed.',
    },
    {
      title: 'Fingerprint comparison',
      description:
        'onenv get <ns> <KEY> --fingerprint returns sha256:<hex>. Diff two environments or confirm a rotation reached prod without exposing the value.',
    },
    {
      title: 'Atomic bulk import',
      description:
        'onenv import --overwrite snapshots every key it would touch, writes the new payload, and rolls back the batch if any single write fails.',
    },
    {
      title: 'JSON file workflow',
      description:
        'onenv import flattens GCP service accounts, OAuth tokens, and kubeconfigs into per-leaf 1Password items. onenv run --file group:VAR materializes the rebuilt JSON to a 0600 tempfile and exposes its path. --from-stdin imports without writing the source JSON to disk.',
    },
    {
      title: 'Per-project namespaces',
      description:
        '.onenv.json declares which namespaces a project pulls. A frontend project does not see backend keys it did not request. Cross-namespace key collisions are a hard error, not silent last-write-wins.',
    },
    {
      title: 'Non-TTY guardrails',
      description:
        'onenv unset refuses to delete from a non-interactive context unless --yes is passed. onenv set and onenv edit require --value-stdin when stdin is not a TTY; piped values error out instead of hanging at the password prompt.',
    },
    {
      title: 'Disable without deleting',
      description:
        'onenv disable hides a key from run and export but keeps it in 1Password. enable restores. State lives in ~/.config/onenv-manager/state.json.',
    },
    {
      title: 'Agent primer',
      description:
        'onenv prime emits the full CLI spec — every command, flag, error code, and state file — as XML, Markdown, or JSON. Pipeable into agent context.',
    },
    {
      title: 'Service-account auth',
      description:
        'OP_SERVICE_ACCOUNT_TOKEN accepts a literal token or an op:// reference. The first call resolves and caches at ~/.config/onenv-manager/op-token (mode 0600); subsequent calls are silent. Re-resolves on auth failure.',
    },
    {
      title: '@-refs',
      description:
        'Positional shorthand against the last namespace list: @1, @2, @last. Avoids retyping long namespace names.',
    },
    {
      title: 'JSON output',
      description:
        'Every command emits machine-readable JSON when piped or with --json. Errors return a structured envelope with code, category, retryable flag, hint, and suggestion.',
    },
  ];

  const steps = [
    {
      title: 'Install',
      description: 'Requires the 1Password CLI and Bun. The installer handles config and optional .env migration.',
      code: 'brew install 1password-cli bun\nop signin\nop vault create onenv\n\ngit clone https://github.com/doublej/onenv && cd onenv\nbun install.ts',
    },
    {
      title: 'Add a secret',
      description: 'Interactive prompt. The value does not appear in shell history or process listings.',
      code: 'onenv set aws AWS_ACCESS_KEY_ID',
    },
    {
      title: 'Configure your project',
      description: 'Writes a per-project .onenv.json declaring which namespaces this project pulls. Commit it — metadata, not secrets.',
      code: 'cd my-project\nonenv init',
    },
    {
      title: 'Run with secrets injected',
      description: 'Replaces source .env && node app.js. Secrets exist only in the child process’s environment.',
      code: 'onenv run -- node app.js',
    },
    {
      title: 'Pipe values from another store',
      description: '--value-stdin reads the secret from a pipe so the value does not appear in shell history or process listings. Useful for migrating from another secret store.',
      code: 'op read "op://Private/AWS/credential" | onenv set aws AWS_SECRET_ACCESS_KEY --value-stdin\npbpaste | onenv edit cloudflare CLOUDFLARE_API_TOKEN --value-stdin',
    },
    {
      title: 'Check for drift',
      description: 'onenv check compares the current shell environment against the project’s stored secrets via SHA-256. Exits non-zero on mismatch. Safe in a precommit hook or shell prompt: no values are printed.',
      code: 'onenv check\nonenv get aws AWS_SECRET_ACCESS_KEY --fingerprint\n# sha256:f5a1...',
    },
    {
      title: 'Materialize a JSON file',
      description: 'For tools that expect a path instead of env vars (GCP, kubeconfigs, OAuth). The tempfile lives under XDG_RUNTIME_DIR with mode 0600 and is removed on child exit, SIGINT, or SIGTERM.',
      code: 'onenv import google /tmp/sa.json --group sa\nonenv run --file sa:GOOGLE_APPLICATION_CREDENTIALS -- python app.py',
    },
  ];

  let copyState = $state<'idle' | 'copied'>('idle');

  function copyInstall(): void {
    navigator.clipboard.writeText(INSTALL).then(() => {
      copyState = 'copied';
      setTimeout(() => {
        copyState = 'idle';
      }, 1500);
    });
  }
</script>

<header class="hero">
  <div class="container">
    <h1>onenv</h1>
    <p class="tagline">Environment variables, backed by 1Password.</p>
    <p class="description">
      Replaces <code>.env</code> files with per-key 1Password items. Scriptable CLI with structured JSON output.
    </p>
    <div class="hero-actions">
      <div class="install-box">
        <code>{INSTALL}</code>
        <button type="button" onclick={copyInstall} aria-label="Copy install command">
          {copyState === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
    <div class="hero-links">
      <a class="hero-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">View on GitHub</a>
      <a class="hero-link" href="#getting-started">Get started &rarr;</a>
    </div>
  </div>
</header>

<main>
  <section class="features">
    <div class="container">
      <h2>Features</h2>
      <div class="grid">
        {#each features as feature, i}
          <article class="feature-card" style="animation-delay: {i * 80}ms">
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </article>
        {/each}
      </div>
    </div>
  </section>

  <section id="getting-started" class="getting-started">
    <div class="container">
      <h2>Getting started</h2>
      <div class="steps">
        {#each steps as step, i}
          <article class="step" style="animation-delay: {(i + 3) * 200}ms">
            <div class="step-number">{i + 1}</div>
            <div class="step-content">
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              {#if step.code}
                <pre><code>{step.code}</code></pre>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </div>
  </section>

  <section class="why">
    <div class="container">
      <h2>Why</h2>
      <p>
        <code>.env</code> files sit unencrypted next to source code, drift between machines, and end up in <code>git status</code>. Sharing them means Slack DMs and stale copies on multiple laptops.
      </p>
      <p>
        onenv keeps the same <code>KEY=value</code> ergonomics, but values live in a 1Password vault: biometric or service-account auth, full audit log, and atomic rotation. Mutations can be gated behind a macOS permission dialog by setting <code>ONENV_CONFIRM_MUTATIONS=1</code>.
      </p>
    </div>
  </section>
</main>

<footer>
  <div class="container">
    <p>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
      <span class="sep">&middot;</span>
      <a href="{REPO_URL}/blob/main/INSTALL.md" target="_blank" rel="noopener noreferrer">Install guide</a>
      <span class="sep">&middot;</span>
      <a href="{REPO_URL}/tree/main/docs/guides" target="_blank" rel="noopener noreferrer">Guides</a>
      <span class="sep">&middot;</span>
      MIT
    </p>
  </div>
</footer>

<style>
  :global(body) {
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .hero {
    padding: 80px 0 40px;
    text-align: center;
    animation: fadeSlideUp 0.5s ease-out forwards;
  }

  h1 {
    font-family: 'DM Mono', monospace;
    font-size: 4.5rem;
    font-weight: 500;
    letter-spacing: -0.04em;
    line-height: 1;
    margin-bottom: 12px;
  }

  .tagline {
    font-size: 1.35rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 12px;
  }

  .description {
    font-size: 1.1rem;
    color: var(--text-secondary);
    max-width: 600px;
    margin: 0 auto 32px;
  }

  .description :global(code) {
    font-family: 'DM Mono', monospace;
    background: var(--bg-code);
    color: var(--text-code);
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
  }

  .hero-actions {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  .install-box {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    max-width: 100%;
    background: var(--bg-code);
    color: var(--text-code);
    border-radius: 8px;
    padding: 8px 8px 8px 16px;
    overflow: hidden;
  }

  .install-box code {
    font-size: 0.9rem;
    white-space: nowrap;
    overflow-x: auto;
  }

  .install-box button {
    background: none;
    border: 1px solid #444;
    color: var(--text-code);
    padding: 6px 14px;
    border-radius: 4px;
    font: inherit;
    font-family: 'Instrument Sans', sans-serif;
    font-size: 0.85rem;
    cursor: pointer;
    transition: border-color 0.15s;
    flex-shrink: 0;
  }

  .install-box button:hover {
    border-color: #777;
  }

  .hero-links {
    display: flex;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .hero-link {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.9rem;
    padding: 8px 20px;
    border: 1px solid var(--border);
    border-radius: 8px;
    transition: border-color 0.15s;
  }

  .hero-link:hover {
    border-color: var(--text-tertiary);
  }

  main {
    display: flex;
    flex-direction: column;
  }

  section {
    padding: var(--section-padding) var(--container-padding);
  }

  h2 {
    font-size: 1.8rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    text-align: center;
    margin-bottom: 40px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--grid-gap);
  }

  .feature-card {
    background: var(--bg-secondary);
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: 8px;
    animation: fadeSlideUp 0.5s ease-out forwards;
    opacity: 0;
  }

  .feature-card h3 {
    font-size: 1.05rem;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .feature-card p {
    font-size: 0.95rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .getting-started {
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 720px;
    margin: 0 auto;
  }

  .step {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    animation: fadeSlideUp 0.5s ease-out forwards;
    opacity: 0;
  }

  .step-number {
    width: 36px;
    height: 36px;
    min-width: 36px;
    border-radius: 50%;
    background: var(--text-primary);
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .step-content {
    flex: 1;
    min-width: 0;
  }

  .step-content h3 {
    font-size: 1.05rem;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .step-content p {
    color: var(--text-secondary);
    font-size: 0.95rem;
    line-height: 1.5;
    margin-bottom: 12px;
  }

  pre {
    background: var(--bg-code);
    color: var(--text-code);
    border-radius: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    font-size: 0.85rem;
    line-height: 1.55;
    margin: 0;
  }

  pre code {
    color: var(--text-code);
    white-space: pre;
  }

  .why p {
    max-width: 680px;
    margin: 0 auto 1rem;
    color: var(--text-secondary);
  }

  .why :global(code) {
    background: var(--bg-code);
    color: var(--text-code);
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
  }

  footer {
    padding: 32px var(--container-padding);
    text-align: center;
    border-top: 1px solid var(--border);
    color: var(--text-tertiary);
    font-size: 0.9rem;
  }

  footer a {
    color: var(--text-secondary);
    text-decoration: none;
  }

  footer a:hover {
    text-decoration: underline;
  }

  .sep {
    margin: 0 8px;
  }

  @media (max-width: 1000px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 700px) {
    h1 {
      font-size: 3rem;
    }

    .tagline {
      font-size: 1.15rem;
    }

    .grid {
      grid-template-columns: 1fr;
    }

    .install-box {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      padding: 12px;
    }

    .install-box code {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .install-box button {
      width: 100%;
    }
  }
</style>
