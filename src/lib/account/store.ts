import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { getPool } from "@/lib/db";
import type { PlanId } from "@/lib/plans";
import type { Business, BusinessProfile, PlanStatus, User } from "./types";

/** Storage for owners, their login sessions and their businesses. */

export interface NewAccount {
  email: string;
  name: string;
  phone: string;
  passwordHash: string;
  businessName: string;
  website: string;
  plan: PlanId;
  planStatus: PlanStatus;
  auditId: string | null;
  profile: BusinessProfile;
}

export interface BusinessUpdate {
  name?: string;
  website?: string;
  onboardingStep?: number;
  consentAt?: string | null;
  profile?: BusinessProfile;
}

export class EmailTakenError extends Error {}

export interface AccountStore {
  /** Creates the user and their business together. Throws EmailTakenError if the email is in use. */
  createAccount(input: NewAccount): Promise<{ user: User; business: Business }>;
  findLogin(email: string): Promise<{ user: User; passwordHash: string } | null>;
  createSession(userId: string, ttlMs: number): Promise<string>;
  /** The user for a session token, or null when it is unknown or expired. */
  userForSession(token: string): Promise<User | null>;
  deleteSession(token: string): Promise<void>;
  businessForUser(userId: string): Promise<Business | null>;
  updateBusiness(businessId: string, update: BusinessUpdate): Promise<Business>;
}

const newId = () => randomBytes(12).toString("hex");
/** Session tokens are stored hashed, so a leaked database cannot be used to log in. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

class MemoryAccountStore implements AccountStore {
  private users = new Map<string, User & { passwordHash: string }>();
  private sessions = new Map<string, { userId: string; expiresAt: number }>();
  private businesses = new Map<string, Business>();

  async createAccount(input: NewAccount) {
    if ([...this.users.values()].some((user) => user.email === input.email)) throw new EmailTakenError();
    const now = new Date().toISOString();
    const user: User = { id: newId(), email: input.email, name: input.name, phone: input.phone, createdAt: now };
    this.users.set(user.id, { ...user, passwordHash: input.passwordHash });
    const business: Business = {
      id: newId(),
      userId: user.id,
      name: input.businessName,
      website: input.website,
      plan: input.plan,
      planStatus: input.planStatus,
      auditId: input.auditId,
      onboardingStep: 2,
      consentAt: null,
      profile: input.profile,
      createdAt: now,
      updatedAt: now,
    };
    this.businesses.set(business.id, business);
    return { user, business };
  }

  async findLogin(email: string) {
    const found = [...this.users.values()].find((user) => user.email === email);
    if (!found) return null;
    const { passwordHash, ...user } = found;
    return { user, passwordHash };
  }

  async createSession(userId: string, ttlMs: number) {
    const token = randomBytes(32).toString("hex");
    this.sessions.set(hashToken(token), { userId, expiresAt: Date.now() + ttlMs });
    return token;
  }

  async userForSession(token: string) {
    const session = this.sessions.get(hashToken(token));
    if (!session || session.expiresAt < Date.now()) return null;
    const found = this.users.get(session.userId);
    if (!found) return null;
    return { id: found.id, email: found.email, name: found.name, phone: found.phone, createdAt: found.createdAt };
  }

  async deleteSession(token: string) {
    this.sessions.delete(hashToken(token));
  }

  async businessForUser(userId: string) {
    return [...this.businesses.values()].find((business) => business.userId === userId) ?? null;
  }

  async updateBusiness(businessId: string, update: BusinessUpdate) {
    const current = this.businesses.get(businessId);
    if (!current) throw new Error("Business not found");
    const next: Business = {
      ...current,
      ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)),
      profile: update.profile ? { ...current.profile, ...update.profile } : current.profile,
      updatedAt: new Date().toISOString(),
    };
    this.businesses.set(businessId, next);
    return next;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS businesses (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  website text NOT NULL,
  plan text NOT NULL,
  plan_status text NOT NULL,
  audit_id text,
  onboarding_step integer NOT NULL DEFAULT 2,
  consent_at timestamptz,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS businesses_user ON businesses (user_id);
`;

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string;
  password_hash: string;
  created_at: Date;
}

interface BusinessRow {
  id: string;
  user_id: string;
  name: string;
  website: string;
  plan: PlanId;
  plan_status: PlanStatus;
  audit_id: string | null;
  onboarding_step: number;
  consent_at: Date | null;
  profile: BusinessProfile;
  created_at: Date;
  updated_at: Date;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  phone: row.phone,
  createdAt: row.created_at.toISOString(),
});

const toBusiness = (row: BusinessRow): Business => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  website: row.website,
  plan: row.plan,
  planStatus: row.plan_status,
  auditId: row.audit_id,
  onboardingStep: row.onboarding_step,
  consentAt: row.consent_at ? row.consent_at.toISOString() : null,
  profile: row.profile ?? {},
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

class PostgresAccountStore implements AccountStore {
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

  async createAccount(input: NewAccount) {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const users = await client.query<UserRow>(
        `INSERT INTO users (id, email, name, phone, password_hash) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING RETURNING *`,
        [newId(), input.email, input.name, input.phone, input.passwordHash],
      );
      if (!users.rows[0]) {
        await client.query("ROLLBACK");
        throw new EmailTakenError();
      }
      const businesses = await client.query<BusinessRow>(
        `INSERT INTO businesses (id, user_id, name, website, plan, plan_status, audit_id, profile)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [newId(), users.rows[0].id, input.businessName, input.website, input.plan, input.planStatus, input.auditId, JSON.stringify(input.profile)],
      );
      await client.query("COMMIT");
      return { user: toUser(users.rows[0]), business: toBusiness(businesses.rows[0]) };
    } catch (error) {
      if (!(error instanceof EmailTakenError)) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async findLogin(email: string) {
    await this.init();
    const { rows } = await this.pool.query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);
    return rows[0] ? { user: toUser(rows[0]), passwordHash: rows[0].password_hash } : null;
  }

  async createSession(userId: string, ttlMs: number) {
    await this.init();
    const token = randomBytes(32).toString("hex");
    await this.pool.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [
      hashToken(token),
      userId,
      new Date(Date.now() + ttlMs),
    ]);
    return token;
  }

  async userForSession(token: string) {
    await this.init();
    const { rows } = await this.pool.query<UserRow>(
      `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
      [hashToken(token)],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async deleteSession(token: string) {
    await this.init();
    await this.pool.query(`DELETE FROM sessions WHERE token_hash = $1 OR expires_at < now()`, [hashToken(token)]);
  }

  async businessForUser(userId: string) {
    await this.init();
    const { rows } = await this.pool.query<BusinessRow>(
      `SELECT * FROM businesses WHERE user_id = $1 ORDER BY created_at LIMIT 1`,
      [userId],
    );
    return rows[0] ? toBusiness(rows[0]) : null;
  }

  async updateBusiness(businessId: string, update: BusinessUpdate) {
    await this.init();
    const { rows } = await this.pool.query<BusinessRow>(
      `UPDATE businesses SET
         name = COALESCE($2, name),
         website = COALESCE($3, website),
         onboarding_step = COALESCE($4, onboarding_step),
         consent_at = CASE WHEN $5::boolean THEN $6::timestamptz ELSE consent_at END,
         profile = profile || $7::jsonb,
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        businessId,
        update.name ?? null,
        update.website ?? null,
        update.onboardingStep ?? null,
        update.consentAt !== undefined,
        update.consentAt ?? null,
        JSON.stringify(update.profile ?? {}),
      ],
    );
    if (!rows[0]) throw new Error("Business not found");
    return toBusiness(rows[0]);
  }
}

// Kept on globalThis so development hot reloads do not log everyone out.
const globalStore = globalThis as unknown as { __msscoreAccounts?: AccountStore };

export function getAccountStore(): AccountStore {
  if (globalStore.__msscoreAccounts) return globalStore.__msscoreAccounts;
  const pool = getPool();
  globalStore.__msscoreAccounts = pool ? new PostgresAccountStore(pool) : new MemoryAccountStore();
  return globalStore.__msscoreAccounts;
}
