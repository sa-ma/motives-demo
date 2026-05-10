#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
SELECT 'CREATE DATABASE motives_dev'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'motives_dev'
)\gexec

SELECT 'CREATE DATABASE motives_test'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'motives_test'
)\gexec
EOSQL
