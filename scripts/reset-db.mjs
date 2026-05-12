import { execFileSync } from "node:child_process";

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function run(command, args) {
  execFileSync(command, args, {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

function parseDatabaseUrl(databaseUrl) {
  const normalizedUrl = databaseUrl.startsWith("postgres://")
    ? `http://${databaseUrl.slice("postgres://".length)}`
    : databaseUrl.startsWith("postgresql://")
      ? `http://${databaseUrl.slice("postgresql://".length)}`
      : null;

  if (normalizedUrl === null) {
    throw new Error("DATABASE_URL must use a postgres:// or postgresql:// URL.");
  }

  return new URL(normalizedUrl).hostname.replace(/^\[(.*)\]$/, "$1");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPostgres() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      execFileSync(
        "docker",
        ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "postgres", "-d", "postgres"],
        {
          stdio: "ignore",
          cwd: process.cwd(),
        },
      );
      return;
    } catch {
      await sleep(1000);
    }
  }

  throw new Error("Postgres did not become ready within 30 seconds.");
}

async function main() {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run db:reset.");
  }

  if (LOCAL_DATABASE_HOSTS.has(parseDatabaseUrl(databaseUrl))) {
    run("docker", ["compose", "up", "-d", "postgres"]);
    await waitForPostgres();
  }

  run("pnpm", ["--filter", "@motives-ai/api", "db:reset"]);
}

await main();
