import fs from 'fs';
import path from 'path';
import { dbRepository, DestinationRecord } from '../database/repository.js';
import { relevanceScorer, TargetVertical } from './relevanceScorer.js';

export interface RecommendQuery {
  title?: string;
  body: string;
  tags?: string[];
  category?: string;
  is_commercial?: boolean;
}

export interface RecommendationResult {
  rank: number;
  score: number; // 0 to 100
  destination_id: string;
  destination_name: string;
  platform_key: string;
  category?: string | null;
  reasons: string[];
  warnings: string[];
  destination: DestinationRecord;
}

export interface PrecisionEvalCase {
  case_id: string;
  name: string;
  precision_at_10: number;
  top_10_destinations: string[];
  relevant_count: number;
}

export interface PrecisionEvalResult {
  average_precision_at_10: number;
  cases: PrecisionEvalCase[];
  passed_benchmark: boolean; // Precision >= 0.80
}

export class DestinationRecommender {
  /**
   * Ranks all active destinations for a given content candidate.
   */
  public async recommend(query: RecommendQuery, limit: number = 10): Promise<RecommendationResult[]> {
    const destinations = await dbRepository.listDestinations();
    const activeDestinations = destinations.filter((d) => d.status === 'active');

    const scoredItems: Array<{
      dest: DestinationRecord;
      score: number;
      reasons: string[];
      warnings: string[];
    }> = [];

    const queryTags = (query.tags || []).map((t) => t.toLowerCase());
    const queryText = `${query.title || ''} ${query.body} ${queryTags.join(' ')}`.toLowerCase();

    for (const dest of activeDestinations) {
      const reasons: string[] = [];
      const warnings: string[] = [];

      // 1. Audience & Relevance Match (Weight: 0.40)
      const relScore = relevanceScorer.score({
        name: dest.name,
        category: dest.category || undefined,
        audience_tags: dest.audience_tags,
        url: dest.url,
      });

      // Tag overlap
      const destTags = (dest.audience_tags || []).map((t) => t.toLowerCase());
      const overlappingTags = queryTags.filter((t) => destTags.includes(t));
      let audienceMatch = relScore.score / 5.0; // 0.2 to 1.0

      if (overlappingTags.length > 0) {
        audienceMatch = Math.min(1.0, audienceMatch + overlappingTags.length * 0.15);
        reasons.push(`Direct tag match on: ${overlappingTags.join(', ')}`);
      }

      // Keyword match in destination name or category
      if (queryText.includes((dest.category || '').toLowerCase())) {
        audienceMatch = Math.min(1.0, audienceMatch + 0.1);
      }
      reasons.push(relScore.reason);

      // 2. Posting Rules Compatibility (Weight: 0.25)
      let rulesComp = 1.0;
      if (query.is_commercial && !dest.self_promo_allowed) {
        rulesComp -= 0.5;
        warnings.push('Destination prohibits self-promotion; commercial content will require aggressive tailoring');
      }

      if (dest.link_policy === 'prohibited' && query.body.includes('http')) {
        rulesComp -= 0.2;
        warnings.push('Destination prohibits external links');
      }

      if (!dest.automation_allowed) {
        rulesComp -= 0.15;
        warnings.push('Destination requires manual/assisted submission');
      }
      rulesComp = Math.max(0.1, rulesComp);

      // 3. Historical Publishing Results (Weight: 0.20)
      let historicalScore = 0.85; // Default prior
      const publications = await dbRepository.listPublications(dest.id);
      if (publications.length > 0) {
        const successes = publications.filter((p) => p.status === 'published').length;
        const total = publications.length;
        historicalScore = successes / total;
        reasons.push(`Historical publishing success rate: ${Math.round(historicalScore * 100)}% (${successes}/${total})`);
      } else {
        reasons.push('New destination with clean publishing history');
      }

      // 4. Community Authority & Reach (Weight: 0.15)
      const estAudience = dest.est_audience || 1000;
      const reachScore = Math.min(1.0, Math.log10(Math.max(estAudience, 10)) / 6.0);
      reasons.push(`Estimated community size: ${estAudience.toLocaleString()}`);

      // Composite calculation (0 to 100)
      const composite = (
        audienceMatch * 0.40 +
        rulesComp * 0.25 +
        historicalScore * 0.20 +
        reachScore * 0.15
      ) * 100;

      scoredItems.push({
        dest,
        score: Math.round(composite * 10) / 10,
        reasons,
        warnings,
      });
    }

    // Sort descending by score
    scoredItems.sort((a, b) => b.score - a.score);

    return scoredItems.slice(0, limit).map((item, index) => ({
      rank: index + 1,
      score: item.score,
      destination_id: item.dest.id,
      destination_name: item.dest.name,
      platform_key: item.dest.platform_key,
      category: item.dest.category,
      reasons: item.reasons,
      warnings: item.warnings,
      destination: item.dest,
    }));
  }

  /**
   * Evaluates precision@10 on the labelled ground-truth test dataset.
   */
  public async evaluatePrecisionAt10(): Promise<PrecisionEvalResult> {
    const datasetPath = path.resolve(__dirname, 'evaluationDataset.json');
    const rawData = fs.readFileSync(datasetPath, 'utf-8');
    const cases = JSON.parse(rawData);

    const evalCases: PrecisionEvalCase[] = [];
    let totalPrecision = 0;

    for (const testCase of cases) {
      const top10 = await this.recommend(testCase.query, 10);
      let relevantCount = 0;

      for (const rec of top10) {
        const dest = rec.destination;
        const destCorpus = [
          dest.name,
          dest.category || '',
          ...(dest.audience_tags || []),
          dest.platform_key,
        ]
          .join(' ')
          .toLowerCase();

        // Check if destination matches any expected vertical or keyword
        const matchesVertical = testCase.expected_verticals.some((v: string) =>
          destCorpus.includes(v) || (dest.audience_tags || []).includes(v)
        );
        const matchesKeyword = testCase.expected_relevant_keywords.some((kw: string) =>
          destCorpus.includes(kw)
        );

        if (matchesVertical || matchesKeyword) {
          relevantCount++;
        }
      }

      // Precision@10 = number of relevant recommendations / 10
      const pAt10 = Math.min(1.0, relevantCount / 10.0);
      totalPrecision += pAt10;

      evalCases.push({
        case_id: testCase.id,
        name: testCase.name,
        precision_at_10: pAt10,
        top_10_destinations: top10.map((r) => r.destination_name),
        relevant_count: relevantCount,
      });
    }

    const avgPrecision = totalPrecision / cases.length;

    return {
      average_precision_at_10: Math.round(avgPrecision * 1000) / 1000,
      cases: evalCases,
      passed_benchmark: avgPrecision >= 0.80,
    };
  }
}

export const destinationRecommender = new DestinationRecommender();
