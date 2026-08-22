// Small helper to talk to the Supabase Postgres instance from this machine.
//
// The project's direct database host (db.<ref>.supabase.co) is IPv6-only, so we
// connect through the shared session-mode pooler instead. The pooler hostname is
// region specific and the region is not in the project URL, so we probe the
// known regions once and cache the winner in .supabase-region.
//
// Usage:
//   node scripts/db.mjs apply <file.sql>   -- run a .sql file in one transaction
//   node scripts/db.mjs query "<sql>"      -- run ad-hoc SQL, print rows as JSON
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Client } from "pg";

const REGIONS = [
  "eu-west-1",
  "eu-central-1",
  "eu-west-2",
  "us-east-1",
  "us-west-1",
  "ap-southeast-1",
  "ap-northeast-1",
];
const CACHE = new URL("../.supabase-region", import.meta.url);

function env() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const E = env();
const ref = new URL(E.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const password = E.SUPABASE_DB_PASSWORD;
if (!password) throw new Error("SUPABASE_DB_PASSWORD missing from .env.local");

function config(host) {
  return {
    host,
    port: 5432, // session mode: required for DDL / multi-statement transactions
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
  };
}

function candidateHosts() {
  const hosts = [];
  for (const prefix of ["aws-0", "aws-1"]) {
    for (const region of REGIONS) {
      hosts.push(`${prefix}-${region}.pooler.supabase.com`);
    }
  }
  return hosts;
}

async function connect() {
  const cached = existsSync(CACHE) ? readFileSync(CACHE, "utf8").trim() : null;
  const all = candidateHosts();
  const order = cached ? [cached, ...all.filter((h) => h !== cached)] : all;

  let lastErr;
  for (const host of order) {
    const client = new Client(config(host));
    try {
      await client.connect();
      if (host !== cached) writeFileSync(CACHE, host);
      if (!cached) console.error(`[db] connected via ${host}`);
      return client;
    } catch (err) {
      lastErr = err;
      await client.end().catch(() => {});
      // A wrong region/prefix rejects the tenant outright; keep probing. A bad
      // password is fatal everywhere, so stop immediately.
      if (/password authentication failed/i.test(err.message)) throw err;
    }
  }
  throw new Error(`could not connect to any pooler host: ${lastErr?.message}`);
}

const [cmd, arg] = process.argv.slice(2);
const client = await connect();
try {
  if (cmd === "apply") {
    const sql = readFileSync(arg, "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log(`applied ${arg}`);
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  } else if (cmd === "query") {
    const res = await client.query(arg);
    // A multi-statement query string yields one result object per statement.
    const sets = Array.isArray(res) ? res : [res];
    for (const set of sets) {
      if (set.rows?.length) console.log(JSON.stringify(set.rows, null, 2));
    }
  } else {
    throw new Error("usage: db.mjs apply <file.sql> | query <sql>");
  }
} finally {
  await client.end();
}
