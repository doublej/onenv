interface PrefixEntry {
  match: RegExp
  namespace: string
}

// Ordered: more specific patterns first.
const TABLE: PrefixEntry[] = [
  { match: /^STRIPE_/, namespace: 'stripe' },
  { match: /^AWS_/, namespace: 'aws' },
  { match: /^GCP_|^GOOGLE_(?!ANALYTICS_|TAG_)/, namespace: 'gcp' },
  { match: /^AZURE_/, namespace: 'azure' },
  { match: /^CLOUDFLARE_|^CF_/, namespace: 'cloudflare' },
  { match: /^VERCEL_/, namespace: 'vercel' },
  { match: /^NETLIFY_/, namespace: 'netlify' },
  { match: /^FIREBASE_|^FB_/, namespace: 'firebase' },
  { match: /^SUPABASE_/, namespace: 'supabase' },
  { match: /^DATABASE_|^DB_|^POSTGRES_|^PG_|^MYSQL_/, namespace: 'database' },
  { match: /^REDIS_/, namespace: 'redis' },
  { match: /^MONGO_/, namespace: 'mongo' },
  { match: /^SLACK_/, namespace: 'slack' },
  { match: /^DISCORD_/, namespace: 'discord' },
  { match: /^TELEGRAM_/, namespace: 'telegram' },
  { match: /^TWILIO_/, namespace: 'twilio' },
  { match: /^SENDGRID_|^MAILGUN_|^POSTMARK_|^RESEND_/, namespace: 'email' },
  { match: /^GITHUB_|^GH_/, namespace: 'github' },
  { match: /^GITLAB_/, namespace: 'gitlab' },
  { match: /^DROPBOX_|^DBX_/, namespace: 'dropbox' },
  { match: /^SHOPIFY_/, namespace: 'shopify' },
  { match: /^OPENAI_/, namespace: 'openai' },
  { match: /^ANTHROPIC_|^CLAUDE_/, namespace: 'anthropic' },
  { match: /^HUGGING_?FACE_|^HF_/, namespace: 'huggingface' },
  { match: /^SENTRY_/, namespace: 'sentry' },
  { match: /^DATADOG_|^DD_/, namespace: 'datadog' },
  { match: /^POSTHOG_/, namespace: 'posthog' },
  { match: /^MIXPANEL_/, namespace: 'mixpanel' },
  { match: /^AUTH0_/, namespace: 'auth0' },
  { match: /^CLERK_/, namespace: 'clerk' },
  { match: /^NEXTAUTH_/, namespace: 'nextauth' },
]

export function suggestNamespaceFromPrefix(key: string): string | null {
  for (const entry of TABLE) {
    if (entry.match.test(key)) return entry.namespace
  }
  return null
}
