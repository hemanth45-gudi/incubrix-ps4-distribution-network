import { ContentRendition, DestinationConfig } from '@incubrix/connectors';
import { dbRepository, DestinationRecord, RuleDecisionRecord } from '../database/repository.js';
import { AppError } from '../middleware/errorHandler.js';

export interface RuleEvaluationResult {
  passed: boolean;
  action: 'allow' | 'block' | 'reschedule' | 'route_assisted';
  reasons: string[];
  decisions: Array<{
    rule_name: string;
    pass: boolean;
    reason: string;
    action_taken: string;
  }>;
}

const PROMOTIONAL_KEYWORDS = [
  'buy now',
  'limited offer',
  'special discount',
  'promo code',
  'coupon',
  'use discount',
  'purchase here',
  'sign up at',
  'check out our pricing',
  'sale ends',
  'get 50% off',
  'get 20% off',
  'affiliate',
];

export class PostingRulesEngine {
  /**
   * Evaluates all community posting rules before any publication.
   */
  async evaluate(
    rendition: ContentRendition,
    destination: DestinationRecord | DestinationConfig
  ): Promise<RuleEvaluationResult> {
    const decisions: RuleEvaluationResult['decisions'] = [];
    const reasons: string[] = [];
    let overallPassed = true;
    let action: RuleEvaluationResult['action'] = 'allow';

    // ----------------------------------------------------
    // Rule 1: Automation Permission Policy
    // ----------------------------------------------------
    if (destination.automation_allowed === false) {
      const reason = `Destination '${destination.name}' explicitly forbids automated bots/publishing. Requires human assisted posting.`;
      decisions.push({
        rule_name: 'AUTOMATION_PERMISSION',
        pass: false,
        reason,
        action_taken: 'route_assisted',
      });
      reasons.push(reason);
      overallPassed = false;
      action = 'route_assisted';

      await dbRepository.saveRuleDecision({
        destination_id: destination.id,
        rule_name: 'AUTOMATION_PERMISSION',
        pass: false,
        reason,
        action_taken: 'route_assisted',
      });

      return { passed: false, action, reasons, decisions };
    } else {
      decisions.push({
        rule_name: 'AUTOMATION_PERMISSION',
        pass: true,
        reason: 'Automated publishing is permitted by community guidelines',
        action_taken: 'allow',
      });
    }

    // ----------------------------------------------------
    // Rule 2: Frequency Cap Policy
    // ----------------------------------------------------
    if (destination.frequency_cap && destination.frequency_cap.max_posts > 0) {
      const windowDays = destination.frequency_cap.window_days || 7;
      const maxPosts = destination.frequency_cap.max_posts;
      const recentCount = await dbRepository.countPublicationsInWindow(destination.id, windowDays);

      if (recentCount >= maxPosts) {
        const reason = `Frequency cap exceeded: ${recentCount}/${maxPosts} publications already made in the last ${windowDays} days.`;
        decisions.push({
          rule_name: 'FREQUENCY_CAP',
          pass: false,
          reason,
          action_taken: 'block_or_reschedule',
        });
        reasons.push(reason);
        overallPassed = false;
        action = 'reschedule';

        await dbRepository.saveRuleDecision({
          destination_id: destination.id,
          rule_name: 'FREQUENCY_CAP',
          pass: false,
          reason,
          action_taken: 'reschedule',
        });
      } else {
        decisions.push({
          rule_name: 'FREQUENCY_CAP',
          pass: true,
          reason: `Within limits (${recentCount}/${maxPosts} in ${windowDays}d)`,
          action_taken: 'allow',
        });
      }
    }

    // ----------------------------------------------------
    // Rule 3: Self-Promotion Policy
    // ----------------------------------------------------
    const bodyLower = (rendition.body + ' ' + (rendition.title || '')).toLowerCase();
    const detectedPromo = PROMOTIONAL_KEYWORDS.find((k) => bodyLower.includes(k));

    if (destination.self_promo_allowed === false && detectedPromo) {
      const reason = `Self-promotion is prohibited on '${destination.name}'. Detected promotional trigger: "${detectedPromo}"`;
      decisions.push({
        rule_name: 'SELF_PROMOTION_POLICY',
        pass: false,
        reason,
        action_taken: 'block',
      });
      reasons.push(reason);
      overallPassed = false;
      if (action !== 'reschedule') action = 'block';

      await dbRepository.saveRuleDecision({
        destination_id: destination.id,
        rule_name: 'SELF_PROMOTION_POLICY',
        pass: false,
        reason,
        action_taken: 'block',
      });
    } else {
      decisions.push({
        rule_name: 'SELF_PROMOTION_POLICY',
        pass: true,
        reason: destination.self_promo_allowed
          ? 'Self-promotion allowed on destination'
          : 'No promotional language detected',
        action_taken: 'allow',
      });
    }

    // ----------------------------------------------------
    // Rule 4: Link Policy
    // ----------------------------------------------------
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const foundUrls = rendition.body.match(urlRegex) || [];

    if (destination.link_policy === 'prohibited' && (foundUrls.length > 0 || rendition.canonical_url)) {
      const reason = `Links are strictly prohibited on destination '${destination.name}'. Found ${foundUrls.length} link(s).`;
      decisions.push({
        rule_name: 'LINK_POLICY',
        pass: false,
        reason,
        action_taken: 'block',
      });
      reasons.push(reason);
      overallPassed = false;
      if (action !== 'reschedule') action = 'block';

      await dbRepository.saveRuleDecision({
        destination_id: destination.id,
        rule_name: 'LINK_POLICY',
        pass: false,
        reason,
        action_taken: 'block',
      });
    } else if (destination.link_policy === 'canonical_only') {
      if (foundUrls.length > 0 && !rendition.canonical_url) {
        const reason = `Destination '${destination.name}' enforces canonical_only link policy, but no canonical_url was provided.`;
        decisions.push({
          rule_name: 'LINK_POLICY',
          pass: false,
          reason,
          action_taken: 'block',
        });
        reasons.push(reason);
        overallPassed = false;
        if (action !== 'reschedule') action = 'block';

        await dbRepository.saveRuleDecision({
          destination_id: destination.id,
          rule_name: 'LINK_POLICY',
          pass: false,
          reason,
          action_taken: 'block',
        });
      } else {
        decisions.push({
          rule_name: 'LINK_POLICY',
          pass: true,
          reason: 'Canonical link requirements satisfied',
          action_taken: 'allow',
        });
      }
    } else {
      decisions.push({
        rule_name: 'LINK_POLICY',
        pass: true,
        reason: 'Links are permitted',
        action_taken: 'allow',
      });
    }

    // ----------------------------------------------------
    // Rule 5: AI Disclosure Policy
    // ----------------------------------------------------
    if (destination.disclosure_required && rendition.is_ai_generated) {
      const hasExplicitDisclosure =
        (rendition.ai_disclosure && rendition.ai_disclosure.trim().length > 0) ||
        bodyLower.includes('#ai') ||
        bodyLower.includes('generated by ai') ||
        bodyLower.includes('ai disclosure');

      if (!hasExplicitDisclosure) {
        const reason = `Destination '${destination.name}' mandates explicit AI disclosure for AI-assisted content. Disclosure missing.`;
        decisions.push({
          rule_name: 'AI_DISCLOSURE_POLICY',
          pass: false,
          reason,
          action_taken: 'block',
        });
        reasons.push(reason);
        overallPassed = false;
        if (action !== 'reschedule') action = 'block';

        await dbRepository.saveRuleDecision({
          destination_id: destination.id,
          rule_name: 'AI_DISCLOSURE_POLICY',
          pass: false,
          reason,
          action_taken: 'block',
        });
      } else {
        decisions.push({
          rule_name: 'AI_DISCLOSURE_POLICY',
          pass: true,
          reason: 'Mandatory AI disclosure statement present',
          action_taken: 'allow',
        });
      }
    } else {
      decisions.push({
        rule_name: 'AI_DISCLOSURE_POLICY',
        pass: true,
        reason: 'AI disclosure not required or content is non-AI',
        action_taken: 'allow',
      });
    }

    // Save passing summary decision
    if (overallPassed) {
      await dbRepository.saveRuleDecision({
        destination_id: destination.id,
        rule_name: 'RULE_EVALUATION_SUMMARY',
        pass: true,
        reason: 'All posting rules satisfied',
        action_taken: 'allow',
      });
    }

    return {
      passed: overallPassed,
      action,
      reasons,
      decisions,
    };
  }
}

export const rulesEngine = new PostingRulesEngine();
