/**
 * The app must refuse to run scoped queries as a role that ignores row-level
 * security (#140). Pure logic only: no database.
 */
import { createRoleGuard, enforceRole, roleViolation } from "../src/db/role-guard.ts";

let pass = 0;
let fail = 0;
const t = (name: string, ok: boolean) => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}`);
  }
};

const app = { role: "endpoint", superuser: false, bypassRls: false };
const owner = { role: "neondb_owner", superuser: false, bypassRls: true };
const superuser = { role: "postgres", superuser: true, bypassRls: false };

t("the application role is fine", roleViolation(app) === null);
t("a BYPASSRLS role is flagged", roleViolation(owner)?.includes("has BYPASSRLS") === true);
t("a superuser is flagged", roleViolation(superuser)?.includes("is a superuser") === true);
t("the message names the role", roleViolation(owner)?.includes('"neondb_owner"') === true);

let threw = false;
try {
  enforceRole(owner, { production: true, warn: () => {} });
} catch {
  threw = true;
}
t("production throws on a BYPASSRLS role", threw);

const warnings: string[] = [];
enforceRole(owner, { production: false, warn: (m) => warnings.push(m) });
t("development warns instead of throwing", warnings.length === 1);

const quiet: string[] = [];
enforceRole(app, { production: true, warn: (m) => quiet.push(m) });
t("the application role passes silently in production", quiet.length === 0);

// Checked once per process.
let calls = 0;
const once = createRoleGuard(
  async () => {
    calls++;
    return app;
  },
  { production: true, warn: () => {} },
);
await once();
await once();
t("the role is queried once per process", calls === 1);

// A lookup that failed (database unreachable) is retried, not cached.
let attempts = 0;
const flaky = createRoleGuard(
  async () => {
    attempts++;
    if (attempts === 1) throw new Error("connection refused");
    return app;
  },
  { production: true, warn: () => {} },
);
let firstFailed = false;
try {
  await flaky();
} catch {
  firstFailed = true;
}
await flaky();
t("a failed lookup is retried on the next call", firstFailed && attempts === 2);

// A violation in production keeps failing every scoped query.
let ownerCalls = 0;
const blocked = createRoleGuard(
  async () => {
    ownerCalls++;
    return owner;
  },
  { production: true, warn: () => {} },
);
let failures = 0;
for (let i = 0; i < 3; i++) {
  try {
    await blocked();
  } catch {
    failures++;
  }
}
t("a production violation fails every call", failures === 3 && ownerCalls === 1);

console.log(`role-guard: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
