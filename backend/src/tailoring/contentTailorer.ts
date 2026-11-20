import { DestinationRecord } from '../database/repository.js';

export interface RawContent {
  title?: string;
  body: string;
  canonical_url?: string;
  tags?: string[];
  ai_generated?: boolean;
  media_urls?: string[];
}

export interface TailoredContent {
  title?: string;
  body: string;
  tags: string[];
  canonical_url?: string;
  media_urls?: string[];
  adaptations_applied: string[];
  target_platform: string;
  destination_id: string;
}

export class ContentTailorer {
  /**
   * Adapts raw content for a specific destination based on its platform, audience, and rules.
   */
  public tailor(content: RawContent, destination: DestinationRecord): TailoredContent {
    const adaptations: string[] = [];
    let tailoredTitle = content.title ? content.title.trim() : '';
    let tailoredBody = content.body.trim();
    let tailoredTags = [...(content.tags || [])];
    let canonicalUrl = content.canonical_url;

    // 1. Title formatting & truncation (at word boundary)
    if (tailoredTitle) {
      let maxTitleLength = 255;
      if (destination.platform_key === 'lemmy' || destination.platform_key === 'devto' || destination.platform_key === 'peertube') {
        maxTitleLength = 100;
      }

      if (tailoredTitle.length > maxTitleLength) {
        tailoredTitle = this.truncateAtWordBoundary(tailoredTitle, maxTitleLength);
        adaptations.push(`Truncated title to ${maxTitleLength} chars at word boundary for ${destination.platform_key}`);
      }
    }

    // 2. Platform-specific framing
    if (destination.platform_key === 'discourse' || destination.platform_key === 'lemmy') {
      // Forum discussion framing: ensure interactive closing question
      if (!tailoredBody.includes('?')) {
        tailoredBody += '\n\nWhat are your thoughts on this approach? Looking forward to community discussion and feedback!';
        adaptations.push('Added conversational closing question to encourage forum discussion');
      }
    } else if (destination.platform_key === 'slack') {
      // Slack formatting: convert **bold** to *bold*, [text](url) to <url|text>
      tailoredBody = tailoredBody
        .replace(/\*\*(.*?)\*\*/g, '*$1*')
        .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<$2|$1>');
      adaptations.push('Converted markdown to Slack mrkdwn syntax (*bold*, <url|text>)');
    }

    // 3. Link policy compliance
    if (destination.link_policy === 'prohibited') {
      // Remove markdown links and bare URLs
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
      if (linkRegex.test(tailoredBody)) {
        tailoredBody = tailoredBody.replace(linkRegex, '$1');
        adaptations.push('Stripped markdown hyperlinks to comply with prohibited link policy');
      }
      const bareUrlRegex = /(https?:\/\/[^\s]+)/g;
      if (bareUrlRegex.test(tailoredBody)) {
        tailoredBody = tailoredBody.replace(bareUrlRegex, '[link removed per community rules]');
        adaptations.push('Replaced bare URLs with plain text placeholder');
      }
      canonicalUrl = undefined;
    } else if (destination.link_policy === 'canonical_only') {
      if (!canonicalUrl && content.canonical_url) {
        canonicalUrl = content.canonical_url;
      }
      adaptations.push('Configured canonical URL attribution in metadata');
    }

    // 4. Self-promotion policy compliance
    if (!destination.self_promo_allowed) {
      // Soften blatant commercial/CTA phrasing
      const ctaPatterns = [
        /check out my (product|tool|app|startup|saas)/gi,
        /buy now/gi,
        /sign up (at|today|here)/gi,
        /use coupon/gi,
      ];
      let replaced = false;
      for (const pattern of ctaPatterns) {
        if (pattern.test(tailoredBody)) {
          tailoredBody = tailoredBody.replace(pattern, 'discussing open architecture and learnings');
          replaced = true;
        }
      }
      if (replaced) {
        adaptations.push('Softened commercial promotional CTAs to comply with strict anti-self-promo policy');
      }
    }

    // 5. AI-Content disclosure injection
    if (destination.disclosure_required && content.ai_generated) {
      const disclosureNotice = '\n\n*Transparency Note: This material was researched and drafted with AI assistance in accordance with community guidelines.*';
      if (!tailoredBody.includes('Transparency Note')) {
        tailoredBody += disclosureNotice;
        adaptations.push('Injected mandatory AI-assisted content disclosure notice');
      }
    }

    // 6. Audience tags alignment
    if (destination.audience_tags && destination.audience_tags.length > 0) {
      // Blend content tags with top destination tags
      const combined = Array.from(new Set([...tailoredTags, ...destination.audience_tags.slice(0, 2)]));
      tailoredTags = combined.slice(0, 4); // Limit to 4 tags max (Dev.to / Hashnode limit)
      adaptations.push(`Aligned tags with community audience (${tailoredTags.join(', ')})`);
    }

    return {
      title: tailoredTitle || undefined,
      body: tailoredBody,
      tags: tailoredTags,
      canonical_url: canonicalUrl,
      media_urls: content.media_urls,
      adaptations_applied: adaptations,
      target_platform: destination.platform_key,
      destination_id: destination.id,
    };
  }

  private truncateAtWordBoundary(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    const truncated = text.slice(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
  }
}

export const contentTailorer = new ContentTailorer();
