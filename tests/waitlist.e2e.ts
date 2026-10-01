import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';

// The dev-only sink saveSubscriber() appends to when no endpoint is configured.
// e2e.config.ts blanks the endpoint vars so every signup here lands in it.
const SINK = path.join(import.meta.dirname, '..', '.waitlist.jsonl');

async function sinkLines(): Promise<string[]> {
  const contents = await readFile(SINK, 'utf8').catch(() => '');
  return contents.split('\n').filter(Boolean);
}

const isFor = (email: string) => (line: string) => line.includes(`"email":"${email}"`);

async function sinkContains(email: string): Promise<boolean> {
  return (await sinkLines()).some(isFor(email));
}

// So local runs don't pile test addresses into the sink a developer reads.
async function removeFromSink(email: string): Promise<void> {
  const lines = await sinkLines();
  const kept = lines.filter((line) => !isFor(email)(line));
  if (kept.length === lines.length) return;
  await writeFile(SINK, kept.map((line) => `${line}\n`).join(''), 'utf8');
}

test('the homepage renders the hero and the waitlist', async ({ app, screen }) => {
  await app.open('/');
  await expect(
    screen.getByRole('heading', 'The open-source form builder for marketers.', { level: 1 }),
  ).toBeVisible();
  await expect(screen.getByRole('button', 'Join the waitlist')).toHaveCount(2);
});

test('an invalid address is refused and nothing is stored', async ({ app, screen }) => {
  const email = `not-an-email-${Date.now()}`;
  await app.open('/');

  await screen.getByLabel('Work email').first().fill(email);
  await screen.getByRole('button', 'Join the waitlist').first().tap();

  await expect(screen.getByText('That doesn’t look like an email address.')).toBeVisible();
  await expect(screen.getByText('On the list')).toHaveCount(0);
  expect(await sinkContains(email)).toBe(false);
});

test('a visitor joins the waitlist and the address is actually stored', async ({ app, agent, screen }) => {
  const email = `e2e+${Date.now()}@example.test`;
  await app.open('/');

  try {
    await agent.act('join the waitlist with the email {email}', { params: { email: unique(email) } });

    await expect(screen.getByText('On the list')).toBeVisible();
    await expect(screen.getByText('You’re on the list.', { exact: false })).toBeVisible();

    // The success message alone proves nothing: the site's whole claim is that it
    // never says "on the list" without having written the address down.
    expect(await sinkContains(email)).toBe(true);
  } finally {
    await removeFromSink(email);
  }
});
