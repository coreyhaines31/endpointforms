import { createUserWithPassword } from "./src/lib/auth/account.ts";
const r = await createUserWithPassword("demo@endpointforms.test", "DemoPassword2026!");
console.log(JSON.stringify(r).slice(0, 100));
