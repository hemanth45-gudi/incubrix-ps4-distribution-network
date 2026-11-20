export type TargetVertical = 'ai' | 'video' | 'marketing' | 'saas' | 'creators' | 'founders';

export interface ScoreInput {
  name: string;
  category?: string;
  audience_tags?: string[];
  description?: string;
  url?: string;
}

export interface ScoreResult {
  score: number; // 1 to 5
  matched_verticals: TargetVertical[];
  vertical_scores: Record<TargetVertical, number>;
  primary_vertical: TargetVertical | 'general';
  reason: string;
}

const VERTICAL_KEYWORDS: Record<TargetVertical, string[]> = {
  ai: [
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning',
    'llm', 'generative ai', 'genai', 'nlp', 'neural', 'data science',
    'prompt engineering', 'agent', 'automation', 'langchain', 'openai',
  ],
  video: [
    'video', 'streaming', 'peertube', 'youtube', 'vimeo', 'broadcast',
    'motion graphics', 'animation', 'media production', 'filmmaking',
    'video editing', 'vod', 'livestream',
  ],
  marketing: [
    'marketing', 'growth', 'seo', 'content marketing', 'copywriting',
    'acquisition', 'conversion', 'social media', 'advertising', 'ads',
    'analytics', 'branding', 'distribution', 'lead generation',
  ],
  saas: [
    'saas', 'software as a service', 'b2b', 'cloud', 'micro-saas',
    'product management', 'product-led growth', 'plg', 'indie hacker',
    'bootstrapping', 'churn', 'mrr', 'arr', 'api',
  ],
  creators: [
    'creators', 'creator economy', 'content creator', 'podcasting',
    'newsletter', 'writing', 'blogging', 'publishing', 'author',
    'influencer', 'digital creator', 'community builder',
  ],
  founders: [
    'founders', 'startup', 'startups', 'entrepreneur', 'entrepreneurship',
    'venture capital', 'vc', 'angel investing', 'pitch', 'fundraising',
    'building in public', 'buildinpublic', 'side project', 'mvp',
  ],
};

export class RelevanceScorer {
  /**
   * Scores a destination from 1 to 5 based on relevance to AI, video, marketing, SaaS, creators, and founders.
   */
  public score(input: ScoreInput): ScoreResult {
    const textCorpus = [
      input.name,
      input.category || '',
      ...(input.audience_tags || []),
      input.description || '',
      input.url || '',
    ]
      .join(' ')
      .toLowerCase();

    const verticalScores: Record<TargetVertical, number> = {
      ai: 0,
      video: 0,
      marketing: 0,
      saas: 0,
      creators: 0,
      founders: 0,
    };

    const matchedVerticals: TargetVertical[] = [];

    // Calculate match strength per vertical
    for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS) as [TargetVertical, string[]][]) {
      let hits = 0;
      for (const kw of keywords) {
        // Word boundary or substring matching
        if (textCorpus.includes(kw)) {
          // Extra weight if tag or name explicitly equals keyword
          const exactTagHit = input.audience_tags?.some((t) => t.toLowerCase() === kw);
          const exactNameHit = input.name.toLowerCase().includes(kw);
          hits += exactTagHit ? 2 : exactNameHit ? 1.5 : 1;
        }
      }

      if (hits > 0) {
        matchedVerticals.push(vertical);
        verticalScores[vertical] = hits;
      }
    }

    // Determine primary vertical
    let primaryVertical: TargetVertical | 'general' = 'general';
    let maxHit = 0;
    for (const [v, hit] of Object.entries(verticalScores) as [TargetVertical, number][]) {
      if (hit > maxHit) {
        maxHit = hit;
        primaryVertical = v;
      }
    }

    // Compute unified 1 to 5 score
    let finalScore = 1;
    let reason = '';

    if (matchedVerticals.length === 0) {
      finalScore = 1;
      reason = 'Score 1: General destination with no explicit alignment to AI, video, marketing, SaaS, creators, or founders.';
    } else if (maxHit < 2) {
      finalScore = 2;
      reason = `Score 2: Weak alignment to ${primaryVertical}; occasional relevant discussion detected.`;
    } else if (matchedVerticals.length === 1 && maxHit < 4) {
      finalScore = 3;
      reason = `Score 3: Moderate alignment to ${primaryVertical} with dedicated topic discussions and matching tags.`;
    } else if (matchedVerticals.length >= 2 && maxHit >= 4) {
      finalScore = 5;
      reason = `Score 5: Flagship destination highly specialized for ${matchedVerticals.join(' and ')} with strong keyword density and high target audience overlap.`;
    } else {
      finalScore = 4;
      reason = `Score 4: High alignment across core vertical(s) (${matchedVerticals.join(', ')}) with active community interest.`;
    }

    return {
      score: finalScore,
      matched_verticals: matchedVerticals,
      vertical_scores: verticalScores,
      primary_vertical: primaryVertical,
      reason,
    };
  }
}

export const relevanceScorer = new RelevanceScorer();
