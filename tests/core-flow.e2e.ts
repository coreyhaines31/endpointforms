import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Sign up to a stamped submission, through the product's two surfaces: the
// hosted form a person fills and the MCP tool an agent calls. Serial because
// each step builds on the account, workspace and endpoint the previous one made;
// the group shares one browser session, so the sign-up's login carries through.

const run = Date.now();
const email = `e2e+${run}@example.test`;
const password = `e2e correct horse ${run}`;
// Reserved words like "test" and "e2e" are refused as workspace slugs.
const slug = `acme-${run}`;
// Nothing a row shows may contain a stamp word (Human, Agent, Unverified), or
// the inbox assertions below would match the data instead of the stamp.
const visitorEmail = `grace+${run}@example.test`;
const agentEmail = `ada+${run}@example.test`;

let publicId = '';

describe('core flow', { serial: true }, () => {
  test('a new user signs up and creates a workspace', async ({ app, screen, browser }) => {
    await app.open('/signup');
    await screen.getByLabel('Work email').fill(email);
    await screen.getByLabel('Password').fill(password);
    await screen.getByRole('button', 'Create account').tap();

    await expect(screen.getByRole('heading', 'Create your workspace')).toBeVisible();
    await screen.getByLabel('Workspace name').fill(`Acme ${run}`);
    await screen.getByLabel('Workspace URL').fill(slug);
    await screen.getByRole('button', 'Create workspace').tap();

    await expect(screen.getByRole('heading', `Acme ${run}`, { level: 1 })).toBeVisible();
    await expect(browser).toHaveURL(`/app/${slug}`);
  });

  test('the agent builds a form and it is published', async ({ app, agent, screen, browser }) => {
    await app.open(`/app/${slug}/endpoints`);
    await screen.getByLabel('Endpoint name').fill('Demo request');
    await screen.getByRole('button', 'Create endpoint').tap();

    await expect(browser).toHaveURL(new RegExp(`/app/${slug}/endpoints/[A-Za-z0-9_-]{12}$`));
    publicId = (await browser.url()).split('/').pop() ?? '';

    await screen.getByRole('link', 'Build a form').tap();
    await expect(screen.getByRole('heading', 'Form', { level: 1 })).toBeVisible();

    await agent.act(
      'add two fields to the form: a required text field labelled "Your name", and a required email field labelled "Work email". Only edit the fields: do not publish and do not save.',
    );
    await agent.assert(
      'the form editor lists two fields, "Your name" (Text, required) and "Work email" (Email, required)',
    );

    // Exact match: once a version is live the button reads "Publish — replaces
    // what is live", so this also proves the agent did not publish on its own.
    await screen.getByRole('button', 'Publish', { exact: true }).tap();
    await expect(
      screen.getByRole('status').filter({ hasText: 'It is live now' }),
    ).toBeVisible();
  });

  test('a visitor submits the hosted form and it is stamped Unverified', async ({ app, screen }) => {
    await app.open(`/f/${publicId}`);
    // Exact fills, never an agent: the hosted form carries honeypot fields an
    // agent filling every textbox would trip.
    await screen.getByLabel('Your name').fill('Grace Hopper');
    await screen.getByLabel('Work email').fill(visitorEmail);
    await screen.getByRole('button', 'Submit').tap();

    await expect(screen.getByRole('heading', 'Thanks — that’s been sent.')).toBeVisible();
  });

  test('an agent submits through the MCP tool', async ({ app }) => {
    const mcp = `${app.baseUrl}/e/${publicId}/mcp`;
    const rpc = async (id: number, method: string, params: unknown) => {
      const response = await fetch(mcp, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
      expect(response.status).toBe(200);
      return (await response.json()) as { result?: Record<string, unknown> };
    };

    const listed = await rpc(1, 'tools/list', {});
    const tools = (listed.result?.tools ?? []) as {
      name: string;
      inputSchema: { properties: Record<string, { format?: string }> };
    }[];
    expect(tools.length).toBe(1);

    // The agent picked the field names in the builder, so read them off the tool
    // the way a real agent would rather than guessing.
    const properties = Object.entries(tools[0].inputSchema.properties);
    const args = Object.fromEntries(
      properties.map(([key, spec]) => [key, spec.format === 'email' ? agentEmail : 'Ada Lovelace']),
    );
    expect(Object.values(args)).toContain(agentEmail);

    const called = await rpc(2, 'tools/call', { name: tools[0].name, arguments: args });
    const structured = (called.result?.structuredContent ?? {}) as Record<string, unknown>;
    expect(JSON.stringify(called.result)).not.toContain('"isError":true');
    expect(structured.status).toBe('accepted');
    // The response's origin is a constant in the handler, not read back from
    // the stored row; the inbox step below is what proves the stamp.
    expect(structured.origin).toBe('agent');
  });

  test('both submissions reach the inbox with their stamps', async ({ app, screen }) => {
    await app.open(`/app/${slug}/submissions?endpoint=${publicId}`);

    // Headless Chromium declares itself in its user agent, so the hosted-form
    // submit is Unverified, not Human. That is the product being honest, and it
    // is why this test does not forge a desktop Chrome user agent.
    const visitorRow = screen.getByRole('row').filter({ hasText: visitorEmail });
    const agentRow = screen.getByRole('row').filter({ hasText: agentEmail });
    // filter({ hasText }) is case-insensitive; the chip renders in uppercase.
    await expect(visitorRow.filter({ hasText: 'Unverified' })).toHaveCount(1);
    await expect(agentRow.filter({ hasText: 'Agent' })).toHaveCount(1);
  });
});
