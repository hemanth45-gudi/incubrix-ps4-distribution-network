import crypto from 'crypto';

export interface DeterministicMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  saves: number;
  watch_time_s: number;
}

/**
 * Generates separate deterministic publication metrics based on publication ID.
 * Consistent across repeated executions for the same ID, distinct for different IDs.
 */
export function generateDeterministicMetrics(publicationId: string): DeterministicMetrics {
  const hash = crypto.createHash('sha256').update(publicationId).digest('hex');

  const num1 = parseInt(hash.substring(0, 8), 16);
  const num2 = parseInt(hash.substring(8, 16), 16);
  const num3 = parseInt(hash.substring(16, 24), 16);
  const num4 = parseInt(hash.substring(24, 32), 16);
  const num5 = parseInt(hash.substring(32, 40), 16);

  // views range: 120 to 6500
  const views = 120 + (num1 % 6380);

  // likes range: 3% to 12% of views + minimum 1
  const likes = Math.max(1, Math.floor(views * (0.03 + (num2 % 90) / 1000)));

  // comments range: 0.5% to 3.5% of views
  const comments = Math.floor(views * (0.005 + (num3 % 30) / 1000));

  // shares range: 0.2% to 2% of views
  const shares = Math.floor(views * (0.002 + (num4 % 18) / 1000));

  // clicks range: 1% to 6% of views
  const clicks = Math.floor(views * (0.01 + (num5 % 50) / 1000));

  // saves range: 0.1% to 1.5% of views
  const saves = Math.floor(views * (0.001 + ((num1 + num2) % 14) / 1000));

  // watch_time_s: views * (15 to 45s)
  const watch_time_s = views * (15 + (num3 % 30));

  return {
    views,
    likes,
    comments,
    shares,
    clicks,
    saves,
    watch_time_s,
  };
}
