import { describe, it, expect, beforeEach } from 'vitest';
import { AiRuleCaptureService } from '../rules/aiRuleCapture.js';

describe('AiRuleCaptureService', () => {
  let service: AiRuleCaptureService;

  beforeEach(() => {
    // Fresh instance per test to avoid shared draft store state
    service = new AiRuleCaptureService();
  });

  it('captureRules() with "no self-promotion" => extracted_rules.self_promo_allowed === false', async () => {
    const draft = await service.captureRules({
      source_text: 'Community rules: no self-promotion allowed in this community.',
    });
    expect(draft.extracted_rules.self_promo_allowed).toBe(false);
  });

  it('captureRules() with "no bots" => extracted_rules.automation_allowed === false', async () => {
    const draft = await service.captureRules({
      source_text: 'No bots or automated accounts are permitted here.',
    });
    expect(draft.extracted_rules.automation_allowed).toBe(false);
  });

  it('captureRules() with "no links" => extracted_rules.link_policy === "prohibited"', async () => {
    const draft = await service.captureRules({
      source_text: 'Posting guidelines: no links are allowed in posts.',
    });
    expect(draft.extracted_rules.link_policy).toBe('prohibited');
  });

  it('captureRules() with "AI disclosure" => extracted_rules.disclosure_required === true', async () => {
    const draft = await service.captureRules({
      source_text: 'AI disclosure is required for all AI-generated content posted here.',
    });
    expect(draft.extracted_rules.disclosure_required).toBe(true);
  });

  it('captureRules() with "3 posts per week" => frequency_cap = { max_posts: 3, window_days: 7 }', async () => {
    const draft = await service.captureRules({
      source_text: 'Members may submit 3 posts per week maximum.',
    });
    expect(draft.extracted_rules.frequency_cap).toEqual({ max_posts: 3, window_days: 7 });
  });

  it('draft status starts as "pending_confirmation"', async () => {
    const draft = await service.captureRules({
      source_text: 'Some community rules.',
    });
    expect(draft.status).toBe('pending_confirmation');
  });

  it('confirmRules(confirmed:false) => status becomes "rejected"', async () => {
    const draft = await service.captureRules({ source_text: 'Rules text.' });
    const result = await service.confirmRules({ draft_id: draft.draft_id, confirmed: false });
    expect(result.draft.status).toBe('rejected');
  });

  it('confirmRules(confirmed:true) => status becomes "confirmed"', async () => {
    const draft = await service.captureRules({ source_text: 'Some rules here.' });
    const result = await service.confirmRules({ draft_id: draft.draft_id, confirmed: true });
    expect(result.draft.status).toBe('confirmed');
  });

  it('listDrafts() returns all created drafts', async () => {
    await service.captureRules({ source_text: 'First rule text.' });
    await service.captureRules({ source_text: 'Second rule text.' });
    const drafts = service.listDrafts();
    expect(drafts.length).toBeGreaterThanOrEqual(2);
  });

  it('getDraft() returns undefined for unknown draft_id', () => {
    const result = service.getDraft('nonexistent-draft-id-xyz');
    expect(result).toBeUndefined();
  });
});
