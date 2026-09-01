#!/usr/bin/env bash
#
# One command that takes a clean checkout to a running instance.
#
#   bash scripts/setup.sh
#
# It installs dependencies, generates the four secrets, starts Postgres,
# applies the migrations and seeds a workspace. Then it tells you to run
# `npm run dev`.
#
# Two things this script exists to get right, because both have already bitten
# this project once:
#
#   1. **The app never connects to Postgres as a superuser.** Tenant isolation
#      is row-level security, and a superuser silently ignores FORCE ROW LEVEL
#      SECURITY — so an instance running as `postgres` has no isolation at all
#      while every test still passes. docker/postgres/init.sql creates the
#      ordinary `endpoint` role, and step 4 below refuses to continue unless
#      that role really is NOSUPERUSER and NOBYPASSRLS. It checks rather than
#      assumes, because the failure is invisible.
#
#   2. **The secrets are generated, not left as a puzzle.** A setup that ends
#      with "now invent an AUTH_SECRET" is a setup most people abandon.
#
# Idempotent. Re-running is safe: an existing .env.local is never overwritten,
# and the migrations and the seed both handle being run again.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ENV_FILE=".env.local"
SEED=1
START_DEV=0

for arg in "$@"; do
  case "$arg" in
    --no-seed) SEED=0 ;;
    --seed)    SEED=1 ;;
    --dev)     START_DEV=1 ;;
    -h|--help)
      awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
      echo
      echo "Options:"
      echo "  --no-seed   Skip the sample workspace. You get an empty database."
      echo "  --dev       Run \`npm run dev\` when setup finishes."
      exit 0
      ;;
    *)
      echo "setup.sh: unknown option $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

step ()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
ok ()    { printf '\033[32m   ✓\033[0m %s\n' "$1"; }
info ()  { printf '     %s\n' "$1"; }
die ()   { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
step "1/6  Prerequisites"
# ---------------------------------------------------------------------------

command -v node >/dev/null 2>&1 || die "Node.js is not installed. This project needs Node 22 or newer: https://nodejs.org"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  die "Node $(node -v) is too old. This project needs Node 22 or newer — it uses --experimental-strip-types to run the database scripts."
fi
ok "Node $(node -v)"

command -v docker >/dev/null 2>&1 || die "Docker is not installed. It runs the Postgres this project needs: https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || die "\`docker compose\` is not available. Docker Compose v2 ships with Docker Desktop and with the docker-compose-plugin package."
docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start Docker Desktop (or \`sudo systemctl start docker\`) and run this again."
ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 'running')"

# ---------------------------------------------------------------------------
step "2/6  Dependencies"
# ---------------------------------------------------------------------------

if [ -d node_modules ] && [ -f node_modules/.package-lock.json ]; then
  info "node_modules is present — skipping install. Delete it and re-run to force a clean install."
else
  npm ci --no-audit --no-fund || die "npm ci failed."
fi
ok "dependencies installed"

# ---------------------------------------------------------------------------
step "3/6  Secrets"
# ---------------------------------------------------------------------------

# 32 random bytes, base64url. Node rather than openssl: node is already a hard
# requirement and openssl is not present everywhere.
secret () { node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'; }

if [ -f "$ENV_FILE" ]; then
  ok "$ENV_FILE already exists — left untouched"
  missing=""
  for name in AUTH_SECRET SUBMISSION_IP_SALT ORIGIN_TOKEN_SECRET VERDICT_API_KEY_SECRET; do
    grep -qE "^[[:space:]]*${name}=..*" "$ENV_FILE" || missing="$missing $name"
  done
  if [ -n "$missing" ]; then
    info "but these are unset or empty in it:$missing"
    info "Each falls back to a built-in default outside production, so development still works."
    info "Generate real ones with:  node -e 'console.log(require(\"node:crypto\").randomBytes(32).toString(\"base64url\"))'"
  fi
else
  cat > "$ENV_FILE" <<EOF
# Written by scripts/setup.sh on $(date -u '+%Y-%m-%dT%H:%M:%SZ').
# Gitignored. docs/24-self-hosting.md §3 lists every variable the code reads,
# what it does, and what happens if you leave it out.

# The local Docker Postgres from docker-compose.yml.
# \`endpoint\` is an ordinary role, NOT the \`postgres\` superuser: a superuser
# bypasses FORCE ROW LEVEL SECURITY, which would silently switch off tenant
# isolation while every test still passed.
DATABASE_URL=postgres://endpoint:endpoint@localhost:5433/endpointforms

# Generated locally. These never left this machine.
AUTH_SECRET=$(secret)
SUBMISSION_IP_SALT=$(secret)
ORIGIN_TOKEN_SECRET=$(secret)
VERDICT_API_KEY_SECRET=$(secret)
EOF
  ok "wrote $ENV_FILE with four generated secrets"
fi

# ---------------------------------------------------------------------------
step "4/6  Postgres"
# ---------------------------------------------------------------------------

# --wait blocks on the healthcheck in docker-compose.yml, which runs a real
# query rather than pg_isready — during initdb's temporary startup pg_isready
# reports ready on a database that is about to be torn down and recreated.
docker compose up -d --wait || die "Postgres did not become healthy. \`docker compose logs postgres\` will say why. If port 5433 is already taken, that is the usual cause."
ok "Postgres is up on localhost:5433"

# The check that matters. docker/postgres/init.sql creates `endpoint` with
# NOSUPERUSER NOBYPASSRLS, but init.sql only runs on a *fresh* volume — so an
# older volume from before that file existed would quietly skip it. Assert the
# result instead of trusting the mechanism.
ROLE_ATTRS="$(docker compose exec -T postgres psql -U postgres -d postgres -tAc \
  "select rolsuper::text || ' ' || rolbypassrls::text from pg_roles where rolname = 'endpoint'" 2>/dev/null || true)"

case "$(echo "$ROLE_ATTRS" | tr -d '[:space:]')" in
  falsefalse)
    ok "app role \`endpoint\` is NOSUPERUSER and NOBYPASSRLS — row-level security applies to it"
    ;;
  "")
    die "The \`endpoint\` role does not exist in this Postgres.
   docker/postgres/init.sql only runs on an empty data volume, so this usually
   means the volume predates that file. Wipe it and start over:
       docker compose down -v && bash scripts/setup.sh"
    ;;
  *)
    die "The \`endpoint\` role can bypass row-level security (rolsuper rolbypassrls = $ROLE_ATTRS).
   Tenant isolation would be inert: every workspace could read every other
   workspace's submissions, and the test suite would still pass. Refusing to
   continue. Recreate the database with:
       docker compose down -v && bash scripts/setup.sh"
    ;;
esac

# ---------------------------------------------------------------------------
step "5/6  Migrations"
# ---------------------------------------------------------------------------

npm run --silent db:migrate || die "Migrations failed."
ok "schema applied"

# ---------------------------------------------------------------------------
step "6/6  Sample data"
# ---------------------------------------------------------------------------

if [ "$SEED" -eq 1 ]; then
  npm run --silent db:seed || die "Seed failed."
  ok "seeded the \`northwind\` workspace"
else
  info "skipped (--no-seed). The database is empty."
fi

# ---------------------------------------------------------------------------
printf '\n────────────────────────────────\n'
printf '\033[32mSetup complete.\033[0m\n\n'
printf 'Start it:\n'
printf '  npm run dev            → http://localhost:3000\n\n'
printf 'Sign in to the seeded workspace, which has 21 submissions, six won\n'
printf 'deals, worked spam examples and four destinations in four health states:\n\n'
printf '  avery@northwind.example / northwind-demo-2026\n\n'
printf 'Or sign up at http://localhost:3000/signup for an empty workspace of\n'
printf 'your own. The seeded password is development-only — `npm run db:seed`\n'
printf 'refuses to run against anything but a local database.\n\n'
printf 'Other commands:\n'
printf '  npm run verify         lint, typecheck, build and tests — one honest exit code\n'
printf '  npm run db:studio      browse the database\n'
printf '  npm run db:reset       wipe and rebuild it from scratch\n'
printf '  docker compose down    stop Postgres (data is kept)\n'

if [ "$START_DEV" -eq 1 ]; then
  printf '\n'
  exec npm run dev
fi
