import { dbRepository, DestinationRecord } from '../database/repository.js';
import { logger } from '../utils/logger.js';

export interface ExtractedRules {
  frequency_cap: { max_posts: number; window_days: number };
  self_promo_allowed: boolean;
  link_policy: 'allowed' | 'prohibited' | 'canonical_only';
  disclosure_required: boolean;
  automation_allowed: boolean;
  min_account_age_days?: number;
  min_karma_or_trust?: number;
  prohibited_topics?: string[];
  rationale: string;
  evidence: string[];
  confidence: number; // 0.0 to 1.0
}

export interface DraftRuleRecord {
  draft_id: string;
  destination_id?: string;
  source_text?: string;
  source_url?: string;
  extracted_rules: ExtractedRules;
  status: 'pending_confirmation' | 'confirmed' | 'rejected';
  created_at: Date;
  reviewed_at?: Date;
  reviewed_by?: string;
}

// In-memory store for pending draft rules
const draftRulesStore = new Map<string, DraftRuleRecord>();

export class AiRuleCaptureService {
  /**
   * Analyzes community guidelines or policies text to extract proposed posting rules.
   * Returns a draft rule that REQUIRES human confirmation before applying to any destination.
   */
  public async captureRules(params: {
    source_text?: string;
    source_url?: string;
    destination_id?: string;
  }): Promise<DraftRuleRecord> {
    const text = params.source_text || '';
    const draftId = `draft-rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Rule heuristics & NLP extraction simulation
    const lower = text.toLowerCase();
    const evidence: string[] = [];

    // 1. Self-promotion detection
    let selfPromoAllowed = true;
    if (
      lower.includes('no self-promotion') ||
      lower.includes('no self promo') ||
      lower.includes('strictly no advertising') ||
      lower.includes('zero tolerance for self promotion') ||
      lower.includes('10:1 ratio')
    ) {
      selfPromoAllowed = false;
      evidence.push('Text explicitly mentions strict prohibition or heavy ratio on self-promotion.');
    } else if (lower.includes('self-promotion is permitted') || lower.includes('show off your work')) {
      selfPromoAllowed = true;
      evidence.push('Text permits sharing projects or self-promotional showcases.');
    }

    // 2. Frequency cap extraction
    let maxPosts = 3;
    let windowDays = 7;
    const freqMatch = lower.match(/(\d+)\s*post[s]?\s*(per|\/)\s*(day|week|month|(\d+)\s*days)/);
    if (freqMatch) {
      maxPosts = parseInt(freqMatch[1], 10);
      const unit = freqMatch[3];
      if (unit.includes('day')) windowDays = 1;
      else if (unit.includes('week')) windowDays = 7;
      else if (unit.includes('month')) windowDays = 30;
      evidence.push(`Detected posting frequency limit: ${maxPosts} post(s) per ${unit}.`);
    } else {
      evidence.push('Default standard rate limit assumed (3 posts / 7 days).');
    }

    // 3. Link policy
    let linkPolicy: 'allowed' | 'prohibited' | 'canonical_only' = 'allowed';
    if (lower.includes('no links') || lower.includes('links prohibited') || lower.includes('no external links')) {
      linkPolicy = 'prohibited';
      evidence.push('External hyperlinks are strictly prohibited in posts.');
    } else if (
      lower.includes('canonical') ||
      lower.includes('canonical url') ||
      lower.includes('cross-post must specify original source')
    ) {
      linkPolicy = 'canonical_only';
      evidence.push('Original cross-posts require canonical URL specification.');
    }

    // 4. AI-content disclosure
    let disclosureRequired = false;
    if (
      lower.includes('ai disclosure') ||
      lower.includes('must disclose ai') ||
      lower.includes('ai-generated content must be labeled') ||
      lower.includes('declare artificial intelligence')
    ) {
      disclosureRequired = true;
      evidence.push('AI-generated content must be explicitly disclosed and labeled.');
    }

    // 5. Automation / bot policy
    let automationAllowed = true;
    if (
      lower.includes('no bots') ||
      lower.includes('automated accounts banned') ||
      lower.includes('no automated scripts') ||
      lower.includes('manual submissions only')
    ) {
      automationAllowed = false;
      evidence.push('Automated or bot submissions are prohibited; manual high-touch posting required.');
    }

    // Calculate extraction confidence
    let confidence = 0.85;
    if (evidence.length >= 3) confidence = 0.95;
    if (text.length < 50) confidence = 0.65;

    const extracted: ExtractedRules = {
      frequency_cap: { max_posts: maxPosts, window_days: windowDays },
      self_promo_allowed: selfPromoAllowed,
      link_policy: linkPolicy,
      disclosure_required: disclosureRequired,
      automation_allowed: automationAllowed,
      prohibited_topics: lower.includes('crypto') || lower.includes('nsfw') ? ['crypto', 'nsfw'] : [],
      rationale: `Extracted ${evidence.length} policy constraints from policy text.`,
      evidence,
      confidence,
    };

    const draftRecord: DraftRuleRecord = {
      draft_id: draftId,
      destination_id: params.destination_id,
      source_text: params.source_text?.slice(0, 500),
      source_url: params.source_url,
      extracted_rules: extracted,
      status: 'pending_confirmation',
      created_at: new Date(),
    };

    draftRulesStore.set(draftId, draftRecord);
    logger.info(`AI Rules Capture created draft ${draftId} (pending human confirmation)`);

    return draftRecord;
  }

  /**
   * Human confirmation step: Approves or rejects the extracted rules.
   * If confirmed, applies them to the specified destination.
   */
  public async confirmRules(params: {
    draft_id: string;
    confirmed: boolean;
    reviewed_by?: string;
    overrides?: Partial<ExtractedRules>;
  }): Promise<{
    draft: DraftRuleRecord;
    updated_destination?: DestinationRecord;
  }> {
    const draft = draftRulesStore.get(params.draft_id);
    if (!draft) {
      throw new Error(`Draft rule '${params.draft_id}' not found`);
    }

    draft.reviewed_at = new Date();
    draft.reviewed_by = params.reviewed_by || 'human_operator';

    if (!params.confirmed) {
      draft.status = 'rejected';
      logger.info(`Draft rule '${params.draft_id}' rejected by reviewer`);
      return { draft };
    }

    draft.status = 'confirmed';
    const finalRules = {
      ...draft.extracted_rules,
      ...(params.overrides || {}),
    };

    let updatedDestination: DestinationRecord | null | undefined;
    if (draft.destination_id) {
      const dest = await dbRepository.getDestinationById(draft.destination_id);
      if (dest) {
        updatedDestination = await dbRepository.updateDestination(draft.destination_id, {
          frequency_cap: finalRules.frequency_cap,
          self_promo_allowed: finalRules.self_promo_allowed,
          link_policy: finalRules.link_policy,
          disclosure_required: finalRules.disclosure_required,
          automation_allowed: finalRules.automation_allowed,
        });
        logger.info(`Applied confirmed rules from draft '${draft.draft_id}' to destination '${draft.destination_id}'`);
      }
    }

    return {
      draft,
      updated_destination: updatedDestination ?? undefined,
    };
  }

  public getDraft(draftId: string): DraftRuleRecord | undefined {
    return draftRulesStore.get(draftId);
  }

  public listDrafts(): DraftRuleRecord[] {
    return Array.from(draftRulesStore.values());
  }
}

export const aiRuleCaptureService = new AiRuleCaptureService();
