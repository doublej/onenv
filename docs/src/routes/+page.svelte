<script lang="ts">
  const REPO_URL = 'https://github.com/doublej/onenv';
  const INSTALL = 'git clone https://github.com/doublej/onenv && cd onenv && bun install.ts';

  const features = [
    {
      title: '.env replacement',
      description:
        'Same KEY=value ergonomics. Values live in a 1Password vault — nothing on disk, no plaintext drifting between laptops.',
    },
    {
      title: 'onenv run -- <cmd>',
      description:
        'Reads your project’s .onenv.json, fetches enabled secrets, injects them as env vars, execs the command. Process exits, secrets disappear.',
    },
    {
      title: 'JSON file workflow',
      description:
        'onenv import flattens GCP service accounts, OAuth tokens, kubeconfigs into per-leaf 1Password items. onenv run --file group:VAR materializes the rebuilt JSON to a 0600 tempfile and exposes its path.',
    },
    {
      title: 'Per-project namespaces',
      description:
        '.onenv.json declares which namespaces a project pulls. No global blast radius — a frontend project never sees backend keys it shouldn’t.',
    },
    {
      title: 'Disable without deleting',
      description:
        'onenv disable hides a key from run/export but keeps it in 1Password. enable restores. State lives in ~/.config/onenv-manager/state.json.',
    },
    {
      title: 'Agent HTTP API',
      description:
        'onenv-api exposes the same surface over HTTP — every mutation gates behind a macOS AppleScript desktop dialog before executing.',
    },
    {
      title: 'Agent primer',
      description:
        'onenv prime emits the full CLI + API spec — every command shape, every error code, every state file, every endpoint — as XML or JSON. Drop straight into agent context.',
    },
    {
      title: '@-refs',
      description:
        'Positional shorthand against the last namespace list — @1, @2, @last. Fast repeat work without retyping long names.',
    },
    {
      title: 'Service-account ready',
      description:
        'OP_SERVICE_ACCOUNT_TOKEN accepts a literal token or an op:// reference. First call resolves and caches at ~/.config/onenv-manager/op-token (mode 0600). Subsequent calls are silent. Self-heals on auth failure.',
    },
    {
      title: 'Grouped listings',
      description:
        'onenv list <ns> --groups buckets keys by their reassembly group, with (ungrouped) for flat secrets. Lets you see at a glance which keys belong to an imported JSON file.',
    },
    {
      title: 'JSON output',
      description:
        'Every command emits machine-readable JSON when piped or with --json. Errors return a structured envelope with code, category, retryable flag, hint, suggestion.',
    },
    {
      title: 'Audit + rotation',
      description:
        '1Password tracks every read. Rotate by overwriting the item — no redeploy, no env file edits, no shipping new tokens to teammates.',
    },
  ];

  const steps = [
    {
      title: 'Install',
      description: 'Requires the 1Password CLI and Bun. The installer wires everything up and walks you through optional .env migration.',
      code: 'brew install 1password-cli bun\nop signin\nop vault create onenv\n\ngit clone https://github.com/doublej/onenv && cd onenv\nbun install.ts',
    },
    {
      title: 'Add a secret',
      description: 'Interactive prompt — values never touch your shell history.',
      code: 'onenv set aws AWS_ACCESS_KEY_ID',
    },
    {
      title: 'Configure your project',
      description: 'Writes a per-project .onenv.json declaring which namespaces this project pulls. Commit it — metadata, not secrets.',
      code: 'cd my-project\nonenv init',
    },
    {
      title: 'Run with secrets injected',
      description: 'Replaces source .env && node app.js. Secrets exist only in the spawned process’ env, gone when it exits.',
      code: 'onenv run -- node app.js',
    },
    {
      title: 'Materialize a JSON file',
      description: 'For tools that want a path instead of env vars (GCP, kubeconfigs, OAuth). Tempfile lives under XDG_RUNTIME_DIR with mode 0600 and is removed on child exit / SIGINT / SIGTERM.',
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
    <p class="description">
      A 1Password-backed environment variable manager. Replaces <code>.env</code> files with per-key 1Password items, a CLI for humans, and an HTTP API for agents with permission brokering.
    </p>
    <div class="hero-cta">
      <a class="btn primary" href={REPO_URL} target="_blank" rel="noopener noreferrer">View on GitHub</a>
      <a class="btn secondary" href="#getting-started">Get started</a>
    </div>
  </div>
</header>

<section class="install">
  <div class="container">
    <div class="install-box">
      <code>{INSTALL}</code>
      <button type="button" onclick={copyInstall} aria-label="Copy install command">
        {copyState === 'copied' ? 'Copied' : 'Copy'}
      </button>
    </div>
  </div>
</section>

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
        <code>.env</code> files leak. They sit unencrypted next to source, drift between machines, get pasted into chat, end up in <code>git status</code> more often than they should, and nobody ever rotates the keys. Sharing them means Slack DMs and stale copies on three laptops.
      </p>
      <p>
        onenv keeps the same <code>KEY=value</code> ergonomics, but the values live in your 1Password vault — biometric or service-account auth, full audit log, atomic rotation, and an HTTP-API surface that gates every mutation behind explicit human approval.
      </p>
    </div>
  </section>
</main>

<footer>
  <div class="container">
    <p>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
      &nbsp;·&nbsp;
      <a href="{REPO_URL}/blob/main/INSTALL.md" target="_blank" rel="noopener noreferrer">Install guide</a>
      &nbsp;·&nbsp;
      <a href="{REPO_URL}/tree/main/docs/guides" target="_blank" rel="noopener noreferrer">Guides</a>
      &nbsp;·&nbsp;
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
    padding: calc(var(--section-padding) * 1.5) var(--container-padding) var(--section-padding);
    text-align: center;
    animation: fadeSlideUp 0.5s ease-out forwards;
  }

  h1 {
    font-size: clamp(2.5rem, 5vw, 3.75rem);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
    margin-bottom: 1.25rem;
  }

  .description {
    font-size: 1.125rem;
    color: var(--text-secondary);
    max-width: 640px;
    margin: 0 auto 2rem;
  }

  .description :global(code) {
    background: var(--bg-code);
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-size: 0.95em;
  }

  .hero-cta {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-block;
    padding: 12px 22px;
    border-radius: 8px;
    font-weight: 500;
    text-decoration: none;
    border: 1px solid var(--border);
    min-height: 44px;
    line-height: 20px;
    transition: transform 0.15s ease-out, background 0.15s ease-out;
  }

  .btn:hover {
    transform: translateY(-1px);
  }

  .btn.primary {
    background: var(--accent);
    color: var(--bg-secondary);
    border-color: var(--accent);
  }

  .btn.secondary {
    background: var(--bg-secondary);
  }

  .install {
    padding: 0 var(--container-padding) var(--section-padding);
    animation: fadeSlideUp 0.5s ease-out 200ms forwards;
    opacity: 0;
  }

  .install-box {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 18px;
    overflow-x: auto;
  }

  .install-box code {
    flex: 1;
    white-space: nowrap;
    color: var(--text-primary);
  }

  .install-box button {
    background: var(--bg-code);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 14px;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    min-height: 36px;
  }

  .install-box button:hover {
    background: var(--border);
  }

  main {
    display: flex;
    flex-direction: column;
  }

  section {
    padding: var(--section-padding) var(--container-padding);
  }

  h2 {
    font-size: clamp(1.75rem, 3vw, 2.25rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    margin-bottom: 2rem;
    text-align: center;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--grid-gap);
  }

  .feature-card {
    background: var(--bg-secondary);
    padding: 22px 24px;
    border: 1px solid var(--border);
    border-radius: 10px;
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
    line-height: 1.55;
  }

  .getting-started {
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 28px;
    max-width: 820px;
    margin: 0 auto;
  }

  .step {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 24px;
    animation: fadeSlideUp 0.5s ease-out forwards;
    opacity: 0;
  }

  .step-number {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--bg-secondary);
    display: grid;
    place-items: center;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .step-content h3 {
    font-size: 1.15rem;
    font-weight: 600;
    margin-bottom: 6px;
  }

  .step-content p {
    color: var(--text-secondary);
    margin-bottom: 12px;
  }

  pre {
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    font-size: 0.92rem;
    line-height: 1.55;
  }

  pre code {
    color: var(--text-primary);
    white-space: pre;
  }

  .why p {
    max-width: 680px;
    margin: 0 auto 1rem;
    color: var(--text-secondary);
  }

  .why :global(code) {
    background: var(--bg-code);
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-size: 0.95em;
  }

  footer {
    padding: 32px var(--container-padding);
    text-align: center;
    border-top: 1px solid var(--border);
    color: var(--text-tertiary);
    font-size: 0.95rem;
  }

  @media (max-width: 1000px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 700px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .step {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .install-box {
      flex-direction: column;
      align-items: stretch;
    }

    .install-box code {
      white-space: pre-wrap;
      word-break: break-word;
    }
  }
</style>
