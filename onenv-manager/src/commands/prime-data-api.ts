import type { ApiSection } from './prime-data.js'

export function buildApi(): ApiSection {
  return {
    description:
      'Local HTTP server (onenv-api) for agent-driven access. Mutating endpoints block on user permission approval (desktop dialog and/or Telegram) before executing.',
    default_url: 'http://127.0.0.1:4317',
    auth: 'Header: x-onenv-token: <AGENT_API_TOKEN>. Compared with sha256 + timing-safe equality.',
    audit_header: 'Optional x-agent-name (≤128 chars) is logged + shown in permission prompts.',
    rate_limit:
      '120 req/IP/min pre-auth (all methods); 60 req/token/min post-auth (mutating only). 429 + Retry-After on exceed.',
    config_env: [
      {
        name: 'AGENT_API_TOKEN',
        required: true,
        description: 'Bearer token clients send via x-onenv-token.',
      },
      { name: 'API_HOST', required: false, default: '127.0.0.1', description: 'Bind address.' },
      { name: 'API_PORT', required: false, default: '4317', description: 'Bind port.' },
      {
        name: 'PERMISSION_MODE',
        required: false,
        default: 'desktop',
        description:
          'desktop | telegram | either | both. Controls which prompts must approve mutations.',
      },
      {
        name: 'PERMISSION_TIMEOUT_MS',
        required: false,
        default: '120000',
        description: 'How long to wait for user approval before denying.',
      },
      {
        name: 'TELEGRAM_BOT_TOKEN',
        required: false,
        description: 'Required if PERMISSION_MODE uses telegram.',
      },
      {
        name: 'TELEGRAM_CHAT_ID',
        required: false,
        description: 'Required if PERMISSION_MODE uses telegram.',
      },
      {
        name: 'ONENV_VAULT',
        required: false,
        default: 'onenv',
        description: '1Password vault name.',
      },
      {
        name: 'ONENV_CATEGORY',
        required: false,
        default: 'API Credential',
        description: '1Password item category.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/health',
        permission: 'none',
        response: '{ok:true}',
        notes: 'Auth not required.',
      },
      {
        method: 'GET',
        path: '/v1/namespaces',
        permission: 'none',
        response: '{namespaces:string[]}',
      },
      {
        method: 'GET',
        path: '/v1/namespaces/:namespace/vars',
        permission: 'none',
        response: '{vars:[{key:string,disabled:boolean}]}',
      },
      {
        method: 'POST',
        path: '/v1/vars/set',
        permission: 'required',
        body: '{namespace, key, value}',
        response: '{ok:true}',
      },
      {
        method: 'POST',
        path: '/v1/vars/edit',
        permission: 'required',
        body: '{namespace, key, value}',
        response: '{ok:true}',
      },
      {
        method: 'POST',
        path: '/v1/vars/unset',
        permission: 'required',
        body: '{namespace, key}',
        response: '{ok:true}',
      },
      {
        method: 'POST',
        path: '/v1/vars/disable',
        permission: 'required',
        body: '{namespace, key}',
        response: '{ok:true}',
      },
      {
        method: 'POST',
        path: '/v1/vars/enable',
        permission: 'required',
        body: '{namespace, key}',
        response: '{ok:true}',
      },
      {
        method: 'POST',
        path: '/v1/env/export',
        permission: 'required',
        body: '{namespaces:string[]}',
        response: '{env:{KEY:"value",...}}',
        notes: 'Same bare-key collision rule as the CLI export.',
      },
    ],
    error_responses: [
      {
        status: 401,
        body: '{error:"unauthorized"}',
        when: 'Missing or wrong x-onenv-token.',
      },
      {
        status: 403,
        body: '{error:"permission denied"}',
        when: 'User denied or timed out the permission prompt.',
      },
      {
        status: 400,
        body: '{error:"<zod message>"}',
        when: 'Request body failed schema validation.',
      },
      {
        status: 500,
        body: '{error:"<message>"}',
        when: 'Unexpected internal failure (e.g. op CLI errors).',
      },
    ],
  }
}
