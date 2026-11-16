import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { AuditProgress, AuditRecord, AuditResult, Lead } from "./types";

/**
 * Where audits and leads are kept.
 *
 * With DATABASE_URL set, PostgreSQL is used and the tables are created on
 * first use. Without it, everything is held in memory, which is fine for
 * local development but is lost when the server restarts.
 */
export interface AuditStore {
  create(input: { host: string; inputUrl: string; pageCap: number }): Promise<AuditRecord>;
  get(id: string): Promise<AuditRecord | null>;
  setProgress(id: string, progress: AuditProgress): Promise<void>;
  complete(id: string, result: AuditResult): Promise<void>;
  fail(id: string, error: string): Promise<void>;
  /** Most recent audit for a host since the given time, failed ones excluded. */
  findRecent(host: string, since: Date): Promise<AuditRecord | null>;
  saveLead(auditId: string, email: string): Promise<Lead>;
  findLead(auditId: string, unlockToken: string): Promise<Lead | null>;
}

const newId = () => randomBytes(12).toString("hex");
const newToken = () => randomBytes(24).toString("hex");

class MemoryStore implements AuditStore {
  private audits = new Map<string, AuditRecord>();
  private leads: Lead[] = [];

  async create(input: { host: string; inputUrl: string; pageCap: number }) {
    const now = new Date().toISOString();
    const record: AuditRecord = {
      id: newId(),
      host: input.host,
      inputUrl: input.inputUrl,
      status: "queued",
      progress: { stage: "Waiting to start", pagesCrawled: 0, pageCap: input.pageCap },
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.audits.set(record.id, record);
    return record;
  }

  async get(id: string) {
    return this.audits.get(id) ?? null;
  }

  private patch(id: string, patch: Partial<AuditRecord>) {
    const record = this.audits.get(id);
    if (record) this.audits.set(id, { ...record, ...patch, updatedAt: new Date().toISOString() });
  }

  async setProgress(id: string, progress: AuditProgress) {
    this.patch(id, { status: "running", progress });
  }

  async complete(id: string, result: AuditResult) {
    this.patch(id, { status: "done", result });
  }

  async fail(id: string, error: string) {
    this.patch(id, { status: "failed", error });
  }

  async findRecent(host: string, since: Date) {
    const matches = [...this.audits.values()]
      .filter((record) => record.host === host && record.status !== "failed" && new Date(record.createdAt) >= since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matches[0] ?? null;
  }

  async saveLead(auditId: string, email: string) {
    const lead: Lead = { auditId, email, unlockToken: newToken(), createdAt: new Date().toISOString() };
    this.leads.push(lead);
    return lead;
  }

  async findLead(auditId: string, unlockToken: string) {
    return this.leads.find((lead) => lead.auditId === auditId && lead.unlockToken === unlockToken) ?? null;
  }
}

interface AuditRow {
  id: string;
  host: string;
  input_url: string;
  status: AuditRecord["status"];
  progress: AuditProgress;
  result: AuditResult | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audits (
  id text PRIMARY KEY,
  host text NOT NULL,
  input_url text NOT NULL,
  status text NOT NULL,
  progress jsonb NOT NULL,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audits_host_created ON audits (host, created_at DESC);
CREATE TABLE IF NOT EXISTS leads (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL REFERENCES audits (id) ON DELETE CASCADE,
  email text NOT NULL,
  unlock_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_audit ON leads (audit_id);
`;

class PostgresStore implements AuditStore {
  private ready: Promise<void> | null = null;

  constructor(private pool: Pool) {}

  private init(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool
        .query(SCHEMA)
        .then(() => undefined)
        .catch((error: unknown) => {
          this.ready = null;
          throw error;
        });
    }
    return this.ready;
  }

  private toRecord(row: AuditRow): AuditRecord {
    return {
      id: row.id,
      host: row.host,
      inputUrl: row.input_url,
      status: row.status,
      progress: row.progress,
      result: row.result,
      error: row.error,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async create(input: { host: string; inputUrl: string; pageCap: number }) {
    await this.init();
    const progress: AuditProgress = { stage: "Waiting to start", pagesCrawled: 0, pageCap: input.pageCap };
    const { rows } = await this.pool.query<AuditRow>(
      `INSERT INTO audits (id, host, input_url, status, progress) VALUES ($1, $2, $3, 'queued', $4) RETURNING *`,
      [newId(), input.host, input.inputUrl, JSON.stringify(progress)],
    );
    return this.toRecord(rows[0]);
  }

  async get(id: string) {
    await this.init();
    const { rows } = await this.pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [id]);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async setProgress(id: string, progress: AuditProgress) {
    await this.init();
    await this.pool.query(
      `UPDATE audits SET status = 'running', progress = $2, updated_at = now() WHERE id = $1 AND status IN ('queued', 'running')`,
      [id, JSON.stringify(progress)],
    );
  }

  async complete(id: string, result: AuditResult) {
    await this.init();
    await this.pool.query(`UPDATE audits SET status = 'done', result = $2, updated_at = now() WHERE id = $1`, [
      id,
      JSON.stringify(result),
    ]);
  }

  async fail(id: string, error: string) {
    await this.init();
    await this.pool.query(`UPDATE audits SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [id, error]);
  }

  async findRecent(host: string, since: Date) {
    await this.init();
    const { rows } = await this.pool.query<AuditRow>(
      `SELECT * FROM audits WHERE host = $1 AND status <> 'failed' AND created_at >= $2 ORDER BY created_at DESC LIMIT 1`,
      [host, since],
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async saveLead(auditId: string, email: string) {
    await this.init();
    const token = newToken();
    const { rows } = await this.pool.query<{ created_at: Date }>(
      `INSERT INTO leads (audit_id, email, unlock_token) VALUES ($1, $2, $3) RETURNING created_at`,
      [auditId, email, token],
    );
    return { auditId, email, unlockToken: token, createdAt: rows[0].created_at.toISOString() };
  }

  async findLead(auditId: string, unlockToken: string) {
    await this.init();
    const { rows } = await this.pool.query<{ email: string; created_at: Date }>(
      `SELECT email, created_at FROM leads WHERE audit_id = $1 AND unlock_token = $2 LIMIT 1`,
      [auditId, unlockToken],
    );
    return rows[0] ? { auditId, email: rows[0].email, unlockToken, createdAt: rows[0].created_at.toISOString() } : null;
  }
}

// Kept on globalThis so development hot reloads do not lose in-memory audits.
const globalStore = globalThis as unknown as { __msscoreStore?: AuditStore };

export function getStore(): AuditStore {
  if (globalStore.__msscoreStore) return globalStore.__msscoreStore;
  const url = process.env.DATABASE_URL;
  if (url) {
    // Loaded lazily so the app runs without PostgreSQL in development.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool: PgPool } = require("pg") as typeof import("pg");
    const internal = /localhost|127\.0\.0\.1|\.railway\.internal|sslmode=disable/.test(url);
    globalStore.__msscoreStore = new PostgresStore(
      new PgPool({ connectionString: url, max: 5, ssl: internal ? undefined : { rejectUnauthorized: false } }),
    );
  } else {
    globalStore.__msscoreStore = new MemoryStore();
  }
  return globalStore.__msscoreStore;
}
