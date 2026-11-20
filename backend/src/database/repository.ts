import { prisma } from './client.js';
import { logger } from '../utils/logger.js';

export interface DestinationRecord {
  id: string;
  name: string;
  url: string;
  platform_key: string;
  surface: string;
  category?: string | null;
  audience_tags: string[];
  language: string;
  geo?: string | null;
  est_audience?: number | null;
  rules_url?: string | null;
  frequency_cap?: { max_posts: number; window_days: number } | null;
  self_promo_allowed: boolean;
  link_policy: 'allowed' | 'prohibited' | 'canonical_only' | string;
  disclosure_required: boolean;
  automation_allowed: boolean;
  connector_key: string;
  relevance_score: number;
  relevance_reason?: string | null;
  level: string;
  status: 'active' | 'disabled' | 'pending' | 'demoted' | string;
  last_certified_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicationRecord {
  id: string;
  destination_id: string;
  connector_key: string;
  idempotency_key: string;
  status: 'pending' | 'published' | 'failed' | 'rejected' | 'deleted' | string;
  title?: string | null;
  body: string;
  live_url?: string | null;
  platform_post_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  is_test: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RuleDecisionRecord {
  id: string;
  destination_id: string;
  rule_name: string;
  pass: boolean;
  reason: string;
  action_taken: string;
  timestamp: Date;
}

export interface JobRecord {
  id: string;
  job_type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  result?: any;
  error?: string | null;
  callback_url?: string | null;
  created_at: Date;
  updated_at: Date;
}

// In-Memory fallback store for simulation mode and tests
class MemoryStore {
  destinations = new Map<string, DestinationRecord>();
  publications = new Map<string, PublicationRecord>();
  ruleDecisions: RuleDecisionRecord[] = [];
  jobs = new Map<string, JobRecord>();

  constructor() {
    this.seedDefaultDestinations();
  }

  seedDefaultDestinations() {
    const defaults: DestinationRecord[] = [
      {
        id: 'dest-discourse-001',
        name: 'Discourse Dev Hub',
        url: 'http://localhost:3001/mock/discourse',
        platform_key: 'discourse',
        surface: 'topic',
        category: 'technology',
        audience_tags: ['ai', 'developers', 'saas'],
        language: 'en',
        geo: 'global',
        est_audience: 45000,
        rules_url: 'https://discourse.example.com/faq',
        frequency_cap: { max_posts: 3, window_days: 7 },
        self_promo_allowed: true,
        link_policy: 'allowed',
        disclosure_required: true,
        automation_allowed: true,
        connector_key: 'discourse',
        relevance_score: 4.8,
        relevance_reason: 'Highly relevant developer audience',
        level: 'L3',
        status: 'active',
        last_certified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'dest-lemmy-001',
        name: 'Lemmy Open Tech',
        url: 'http://localhost:3001/mock/lemmy',
        platform_key: 'lemmy',
        surface: 'post',
        category: 'open-source',
        audience_tags: ['open-source', 'founders'],
        language: 'en',
        geo: 'global',
        est_audience: 28000,
        rules_url: 'https://lemmy.ml/post/rules',
        frequency_cap: { max_posts: 2, window_days: 7 },
        self_promo_allowed: false,
        link_policy: 'allowed',
        disclosure_required: true,
        automation_allowed: true,
        connector_key: 'lemmy',
        relevance_score: 4.2,
        relevance_reason: 'Strict anti-promotional rules',
        level: 'L3',
        status: 'active',
        last_certified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'dest-devto-001',
        name: 'Dev.to Technical Feed',
        url: 'http://localhost:3001/mock/devto',
        platform_key: 'devto',
        surface: 'article',
        category: 'software',
        audience_tags: ['creators', 'saas'],
        language: 'en',
        geo: 'global',
        est_audience: 150000,
        rules_url: 'https://dev.to/conduct',
        frequency_cap: { max_posts: 5, window_days: 7 },
        self_promo_allowed: true,
        link_policy: 'canonical_only',
        disclosure_required: false,
        automation_allowed: true,
        connector_key: 'devto',
        relevance_score: 4.9,
        relevance_reason: 'Requires canonical URLs for cross-posts',
        level: 'L4',
        status: 'active',
        last_certified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'dest-ghost-001',
        name: 'Ghost Engineering Publication',
        url: 'http://localhost:3001/mock/ghost',
        platform_key: 'ghost',
        surface: 'post',
        category: 'engineering',
        audience_tags: ['founders', 'marketing'],
        language: 'en',
        geo: 'global',
        est_audience: 12000,
        rules_url: 'https://blog.example.com/editorial',
        frequency_cap: { max_posts: 4, window_days: 7 },
        self_promo_allowed: true,
        link_policy: 'allowed',
        disclosure_required: true,
        automation_allowed: true,
        connector_key: 'ghost',
        relevance_score: 4.5,
        relevance_reason: 'High conversion long-form publications',
        level: 'L4',
        status: 'active',
        last_certified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'dest-webhook-001',
        name: 'Partner Syndication Network',
        url: 'http://localhost:3001/mock/webhook/receiver',
        platform_key: 'webhook',
        surface: 'payload',
        category: 'syndication',
        audience_tags: ['saas', 'video'],
        language: 'en',
        geo: 'us',
        est_audience: 35000,
        rules_url: 'https://partner.example.org/terms',
        frequency_cap: { max_posts: 10, window_days: 7 },
        self_promo_allowed: true,
        link_policy: 'allowed',
        disclosure_required: false,
        automation_allowed: true,
        connector_key: 'webhook',
        relevance_score: 4.0,
        relevance_reason: 'Direct webhook channel',
        level: 'L3',
        status: 'active',
        last_certified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'dest-assisted-001',
        name: 'High-Touch Subreddit Community',
        url: 'https://reddit.com/r/technology',
        platform_key: 'assisted',
        surface: 'assist_pack',
        category: 'community',
        audience_tags: ['founders', 'ai'],
        language: 'en',
        geo: 'global',
        est_audience: 85000,
        rules_url: 'https://reddit.com/r/technology/about/rules',
        frequency_cap: { max_posts: 1, window_days: 14 },
        self_promo_allowed: false,
        link_policy: 'prohibited',
        disclosure_required: true,
        automation_allowed: false,
        connector_key: 'assisted',
        relevance_score: 4.7,
        relevance_reason: 'Bot posts prohibited, requires assisted pack',
        level: 'L1',
        status: 'active',
        last_certified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'dest-hashnode-001',
        name: 'Hashnode Engineering Hub',
        url: 'http://localhost:3001/mock/hashnode',
        platform_key: 'hashnode',
        surface: 'publication',
        category: 'engineering',
        audience_tags: ['creators', 'ai', 'saas'],
        language: 'en',
        geo: 'global',
        est_audience: 62000,
        rules_url: 'https://hashnode.com/guidelines',
        frequency_cap: { max_posts: 4, window_days: 7 },
        self_promo_allowed: true,
        link_policy: 'canonical_only',
        disclosure_required: false,
        automation_allowed: true,
        connector_key: 'hashnode',
        relevance_score: 4.8,
        relevance_reason: 'Developer publication platform with canonical support',
        level: 'L4',
        status: 'active',
        last_certified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'dest-slack-001',
        name: 'Founder Slack Community',
        url: 'http://localhost:3001/mock/slack/webhook',
        platform_key: 'slack',
        surface: 'channel',
        category: 'founders',
        audience_tags: ['founders', 'marketing', 'saas'],
        language: 'en',
        geo: 'global',
        est_audience: 18000,
        rules_url: 'https://founderslack.example.com/rules',
        frequency_cap: { max_posts: 6, window_days: 7 },
        self_promo_allowed: true,
        link_policy: 'allowed',
        disclosure_required: false,
        automation_allowed: true,
        connector_key: 'slack',
        relevance_score: 4.6,
        relevance_reason: 'Direct real-time engagement in founder Slack channels',
        level: 'L3',
        status: 'active',
        last_certified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'dest-peertube-001',
        name: 'PeerTube Open Video Showcase',
        url: 'http://localhost:3001/mock/peertube',
        platform_key: 'peertube',
        surface: 'channel',
        category: 'video',
        audience_tags: ['video', 'creators', 'ai'],
        language: 'en',
        geo: 'global',
        est_audience: 40000,
        rules_url: 'https://peertube.example.org/terms',
        frequency_cap: { max_posts: 3, window_days: 7 },
        self_promo_allowed: true,
        link_policy: 'allowed',
        disclosure_required: true,
        automation_allowed: true,
        connector_key: 'peertube',
        relevance_score: 4.7,
        relevance_reason: 'Federated decentralized video network for creators',
        level: 'L3',
        status: 'active',
        last_certified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    for (const d of defaults) {
      this.destinations.set(d.id, d);
    }
  }
}

const memoryStore = new MemoryStore();

export class DatabaseRepository {
  private isPostgresAvailable = false;

  constructor() {
    this.probeDatabase();
  }

  async probeDatabase(): Promise<boolean> {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      this.isPostgresAvailable = true;
      return true;
    } catch {
      this.isPostgresAvailable = false;
      return false;
    }
  }

  // ==========================================
  // DESTINATIONS
  // ==========================================
  async getDestinationById(id: string): Promise<DestinationRecord | null> {
    if (this.isPostgresAvailable) {
      try {
        const d = await prisma.destination.findUnique({ where: { id } });
        if (d) return d as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }
    return memoryStore.destinations.get(id) || null;
  }

  async listDestinations(filter?: { platform_key?: string; status?: string }): Promise<DestinationRecord[]> {
    if (this.isPostgresAvailable) {
      try {
        const where: any = {};
        if (filter?.platform_key) where.platform_key = filter.platform_key;
        if (filter?.status) where.status = filter.status;
        const list = await prisma.destination.findMany({ where });
        return list as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    let list = Array.from(memoryStore.destinations.values());
    if (filter?.platform_key) {
      list = list.filter((d) => d.platform_key === filter.platform_key);
    }
    if (filter?.status) {
      list = list.filter((d) => d.status === filter.status);
    }
    return list;
  }

  async createDestination(data: Partial<DestinationRecord>): Promise<DestinationRecord> {
    const id = data.id || `dest-${Date.now()}`;
    const record: DestinationRecord = {
      id,
      name: data.name || 'Unnamed Destination',
      url: data.url || 'http://localhost',
      platform_key: data.platform_key || 'discourse',
      surface: data.surface || 'default',
      category: data.category || null,
      audience_tags: data.audience_tags || [],
      language: data.language || 'en',
      geo: data.geo || null,
      est_audience: data.est_audience || null,
      rules_url: data.rules_url || null,
      frequency_cap: data.frequency_cap || null,
      self_promo_allowed: data.self_promo_allowed ?? true,
      link_policy: data.link_policy || 'allowed',
      disclosure_required: data.disclosure_required ?? false,
      automation_allowed: data.automation_allowed ?? true,
      connector_key: data.connector_key || data.platform_key || 'discourse',
      relevance_score: data.relevance_score || 3.0,
      relevance_reason: data.relevance_reason || null,
      level: data.level || 'L0',
      status: data.status || 'active',
      last_certified_at: data.last_certified_at || null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (this.isPostgresAvailable) {
      try {
        const created = await prisma.destination.create({ data: record as any });
        return created as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    memoryStore.destinations.set(id, record);
    return record;
  }

  async updateDestination(id: string, updates: Partial<DestinationRecord>): Promise<DestinationRecord | null> {
    if (this.isPostgresAvailable) {
      try {
        const updated = await prisma.destination.update({
          where: { id },
          data: updates as any,
        });
        return updated as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    const existing = memoryStore.destinations.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates, updated_at: new Date() };
    memoryStore.destinations.set(id, merged);
    return merged;
  }

  async deleteDestination(id: string): Promise<boolean> {
    if (this.isPostgresAvailable) {
      try {
        await prisma.destination.delete({ where: { id } });
        return true;
      } catch {
        this.isPostgresAvailable = false;
      }
    }
    return memoryStore.destinations.delete(id);
  }

  // ==========================================
  // PUBLICATIONS
  // ==========================================
  async createPublication(data: Partial<PublicationRecord>): Promise<PublicationRecord> {
    const id = data.id || `pub-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const record: PublicationRecord = {
      id,
      destination_id: data.destination_id || '',
      connector_key: data.connector_key || '',
      idempotency_key: data.idempotency_key || `idem-${id}`,
      status: data.status || 'published',
      title: data.title || null,
      body: data.body || '',
      live_url: data.live_url || null,
      platform_post_id: data.platform_post_id || null,
      error_code: data.error_code || null,
      error_message: data.error_message || null,
      is_test: data.is_test ?? false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (this.isPostgresAvailable) {
      try {
        const created = await prisma.publication.create({ data: record as any });
        return created as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    memoryStore.publications.set(id, record);
    return record;
  }

  async getPublicationById(id: string): Promise<PublicationRecord | null> {
    if (this.isPostgresAvailable) {
      try {
        const pub = await prisma.publication.findUnique({ where: { id } });
        if (pub) return pub as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }
    return memoryStore.publications.get(id) || null;
  }

  async getPublicationByIdempotencyKey(key: string): Promise<PublicationRecord | null> {
    if (this.isPostgresAvailable) {
      try {
        const pub = await prisma.publication.findUnique({ where: { idempotency_key: key } });
        if (pub) return pub as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }
    for (const p of memoryStore.publications.values()) {
      if (p.idempotency_key === key) return p;
    }
    return null;
  }

  async listPublications(destinationId?: string): Promise<PublicationRecord[]> {
    if (this.isPostgresAvailable) {
      try {
        const where = destinationId ? { destination_id: destinationId } : {};
        const pubs = await prisma.publication.findMany({ where, orderBy: { created_at: 'desc' } });
        return pubs as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    let list = Array.from(memoryStore.publications.values());
    if (destinationId) {
      list = list.filter((p) => p.destination_id === destinationId);
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  async countPublicationsInWindow(destinationId: string, windowDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    if (this.isPostgresAvailable) {
      try {
        const count = await prisma.publication.count({
          where: {
            destination_id: destinationId,
            status: { in: ['published', 'pending'] },
            created_at: { gte: cutoff },
          },
        });
        return count;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    let count = 0;
    for (const p of memoryStore.publications.values()) {
      if (
        p.destination_id === destinationId &&
        (p.status === 'published' || p.status === 'pending') &&
        p.created_at >= cutoff
      ) {
        count++;
      }
    }
    return count;
  }

  async updatePublicationStatus(id: string, status: string, error?: { code: string; message: string }): Promise<void> {
    if (this.isPostgresAvailable) {
      try {
        await prisma.publication.update({
          where: { id },
          data: {
            status,
            error_code: error?.code,
            error_message: error?.message,
            updated_at: new Date(),
          },
        });
        return;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    const p = memoryStore.publications.get(id);
    if (p) {
      p.status = status;
      if (error) {
        p.error_code = error.code;
        p.error_message = error.message;
      }
      p.updated_at = new Date();
    }
  }

  // ==========================================
  // RULE DECISIONS
  // ==========================================
  async saveRuleDecision(decision: {
    destination_id: string;
    rule_name: string;
    pass: boolean;
    reason: string;
    action_taken: string;
  }): Promise<void> {
    const record: RuleDecisionRecord = {
      id: `rule-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...decision,
      timestamp: new Date(),
    };

    if (this.isPostgresAvailable) {
      try {
        await prisma.postingRuleDecision.create({ data: record });
        return;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    memoryStore.ruleDecisions.push(record);
  }

  async getRuleDecisions(destinationId?: string): Promise<RuleDecisionRecord[]> {
    if (this.isPostgresAvailable) {
      try {
        const where = destinationId ? { destination_id: destinationId } : {};
        const list = await prisma.postingRuleDecision.findMany({ where, orderBy: { timestamp: 'desc' } });
        return list;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    let list = memoryStore.ruleDecisions;
    if (destinationId) {
      list = list.filter((r) => r.destination_id === destinationId);
    }
    return list.slice(-50).reverse();
  }

  // ==========================================
  // BACKGROUND JOBS
  // ==========================================
  async createJob(jobType: string, callbackUrl?: string): Promise<JobRecord> {
    const id = `job-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const record: JobRecord = {
      id,
      job_type: jobType,
      status: 'queued',
      progress: 0,
      result: null,
      error: null,
      callback_url: callbackUrl || null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (this.isPostgresAvailable) {
      try {
        const created = await prisma.backgroundJob.create({ data: record as any });
        return created as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    memoryStore.jobs.set(id, record);
    return record;
  }

  async getJob(id: string): Promise<JobRecord | null> {
    if (this.isPostgresAvailable) {
      try {
        const job = await prisma.backgroundJob.findUnique({ where: { id } });
        if (job) return job as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }
    return memoryStore.jobs.get(id) || null;
  }

  async updateJob(id: string, updates: Partial<JobRecord>): Promise<JobRecord | null> {
    if (this.isPostgresAvailable) {
      try {
        const job = await prisma.backgroundJob.update({
          where: { id },
          data: updates as any,
        });
        return job as any;
      } catch {
        this.isPostgresAvailable = false;
      }
    }

    const existing = memoryStore.jobs.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates, updated_at: new Date() };
    memoryStore.jobs.set(id, merged);
    return merged;
  }

  public clearMemory(): void {
    memoryStore.publications.clear();
    memoryStore.ruleDecisions = [];
    memoryStore.jobs.clear();
    memoryStore.destinations.clear();
    memoryStore.seedDefaultDestinations();
  }
}

export const dbRepository = new DatabaseRepository();
