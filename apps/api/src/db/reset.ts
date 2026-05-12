import { loadApiEnv } from "../lib/env.js";
import { resetDatabase } from "./migrations.js";

const REQUIRED_CONFIRMATION = "true";
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parseDatabaseUrl(databaseUrl: string) {
  const normalizedUrl = databaseUrl.startsWith("postgres://")
    ? `http://${databaseUrl.slice("postgres://".length)}`
    : databaseUrl.startsWith("postgresql://")
      ? `http://${databaseUrl.slice("postgresql://".length)}`
      : null;

  if (normalizedUrl === null) {
    throw new Error("DATABASE_URL must use a postgres:// or postgresql:// URL.");
  }

  const url = new URL(normalizedUrl);
  const databaseName = url.pathname.slice(1);
  const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  return {
    databaseName,
    hostname,
  };
}

loadApiEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run a database reset.");
}

const { databaseName, hostname } = parseDatabaseUrl(databaseUrl);

if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
  if (process.env.ALLOW_REMOTE_DB_RESET !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Refusing non-local reset. Re-run with ALLOW_REMOTE_DB_RESET=${REQUIRED_CONFIRMATION}.`,
    );
  }

  if (process.env.CONFIRM_DB_RESET !== databaseName) {
    throw new Error(
      `Refusing non-local reset. Re-run with CONFIRM_DB_RESET=${databaseName}.`,
    );
  }
}

await resetDatabase(databaseUrl);
