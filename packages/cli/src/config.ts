import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where `login` keeps the key.
 *
 * `$ENDPOINTFORMS_CONFIG_DIR`, else `$XDG_CONFIG_HOME/endpointforms`, else
 * `~/.config/endpointforms`. The file is written 0600 inside a 0700 directory:
 * the key reads every submission in the workspace.
 */

export const DEFAULT_API_URL = "https://app.endpointforms.com";

export type Config = { apiKey?: string; apiUrl?: string };

export type Env = Record<string, string | undefined>;

export function configDir(env: Env): string {
  if (env.ENDPOINTFORMS_CONFIG_DIR) return env.ENDPOINTFORMS_CONFIG_DIR;
  const base = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
  return join(base, "endpointforms");
}

export function configPath(env: Env): string {
  return join(configDir(env), "config.json");
}

export async function readConfig(env: Env): Promise<Config> {
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath(env), "utf8"));
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return {
        apiKey: typeof record.apiKey === "string" ? record.apiKey : undefined,
        apiUrl: typeof record.apiUrl === "string" ? record.apiUrl : undefined,
      };
    }
  } catch {
    // No config yet, or unreadable: treated as logged out.
  }
  return {};
}

export async function writeConfig(env: Env, config: Config): Promise<string> {
  const dir = configDir(env);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = configPath(env);
  await writePrivately(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}

/**
 * Writes a file readable only by its owner — including when it replaces one
 * that was not: `mode` applies only to a file being created, and rewriting an
 * old file in place would hand the new bytes to anyone already holding it
 * open. So the bytes go to a fresh 0600 file that is renamed over the target.
 */
export async function writePrivately(path: string, body: string): Promise<void> {
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, body, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function clearConfig(env: Env): Promise<void> {
  await rm(configPath(env), { force: true });
}

/**
 * The API base URL, without a trailing slash. Plain `http` is refused except
 * for localhost: the key travels in a header on every request.
 */
export function resolveApiUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError(`--api-url ${JSON.stringify(raw)} is not a URL.`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new UsageError(`Refusing to send an API key to ${url.origin}: use https (plain http is allowed only for localhost).`);
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/** A mistake in how the command was called. Exit code 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
