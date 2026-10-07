import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { gateway } from 'ai';

export default {
  // gateway() reads AI_GATEWAY_API_KEY, or the OIDC token of a linked Vercel project.
  agents: {
    default: {
      model: gateway(process.env.E2E_MODEL ?? 'openai/gpt-6-luna-fast'),
      system: 'You are a thorough QA agent. Verify every outcome.',
      context:
        'Endpoint Forms is a form builder. The marketing site has a waitlist form ' +
        '(a single work email field and a "Join the waitlist" button) in the hero ' +
        'and again at the bottom of the homepage.',
    },
  },
  targets: [{
    engine: web(),
    app: {
      // Port 0: the runner picks a free port, so this never collides with a dev
      // server you already have running.
      url: 'http://127.0.0.1:0',
      command: {
        executable: 'npx',
        args: ['next', 'dev', '--hostname', '127.0.0.1', '--port', '{port}'],
        // Blank, not absent: a blank value is not overridden by .env.local, so
        // the waitlist uses the dev-only .waitlist.jsonl sink and the tests never
        // post real signups to a live endpoint.
        env: {
          WAITLIST_ENDPOINT_URL: '',
          NEXT_PUBLIC_WAITLIST_ENDPOINT_URL: '',
          NEXT_TELEMETRY_DISABLED: '1',
          // Pinned, so a DATABASE_URL in .env.local can never point a run at a
          // hosted database: the product tests create real users and rows.
          DATABASE_URL:
            process.env.E2E_DATABASE_URL ??
            'postgres://endpoint:endpoint@localhost:5433/endpointforms',
          AUTH_SECRET: 'e2e-not-a-real-secret-value-for-tests-only',
        },
        log: '.e2e/logs/app.log',
        startupTimeout: 120_000,
      },
    },
  }],
} satisfies E2EConfig;
