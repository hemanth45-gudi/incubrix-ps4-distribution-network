import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding initial destinations into PostgreSQL...');

  const destinations = [
    {
      id: 'dest-discourse-001',
      name: 'Discourse Dev Hub',
      url: 'https://discourse.example.com/c/tech',
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
      relevance_reason: 'Highly relevant developer audience with high organic engagement',
      level: 'L3',
      status: 'active',
    },
    {
      id: 'dest-lemmy-001',
      name: 'Lemmy Open Tech',
      url: 'https://lemmy.ml/c/technology',
      platform_key: 'lemmy',
      surface: 'post',
      category: 'open-source',
      audience_tags: ['open-source', 'founders', 'privacy'],
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
      relevance_reason: 'Strong open-source developer presence; strict self-promo limits',
      level: 'L3',
      status: 'active',
    },
    {
      id: 'dest-devto-001',
      name: 'Dev.to Technical Feed',
      url: 'https://dev.to',
      platform_key: 'devto',
      surface: 'article',
      category: 'software',
      audience_tags: ['creators', 'saas', 'video'],
      language: 'en',
      geo: 'global',
      est_audience: 150000,
      rules_url: 'https://dev.to/conduct',
      frequency_cap: { max_posts: 4, window_days: 7 },
      self_promo_allowed: true,
      link_policy: 'canonical_only',
      disclosure_required: false,
      automation_allowed: true,
      connector_key: 'devto',
      relevance_score: 4.9,
      relevance_reason: 'Massive engineering creator audience; requires canonical links for SEO',
      level: 'L4',
      status: 'active',
    },
    {
      id: 'dest-ghost-001',
      name: 'Ghost Engineering Publication',
      url: 'https://blog.example.com',
      platform_key: 'ghost',
      surface: 'post',
      category: 'engineering',
      audience_tags: ['founders', 'marketing', 'creators'],
      language: 'en',
      geo: 'global',
      est_audience: 12000,
      rules_url: 'https://blog.example.com/editorial',
      frequency_cap: { max_posts: 5, window_days: 7 },
      self_promo_allowed: true,
      link_policy: 'allowed',
      disclosure_required: true,
      automation_allowed: true,
      connector_key: 'ghost',
      relevance_score: 4.5,
      relevance_reason: 'Dedicated company blog with high conversion potential',
      level: 'L4',
      status: 'active',
    },
    {
      id: 'dest-webhook-001',
      name: 'Partner Syndication Network',
      url: 'https://partner.example.org/api/webhook/posts',
      platform_key: 'webhook',
      surface: 'feed',
      category: 'syndication',
      audience_tags: ['saas', 'marketing', 'video'],
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
      relevance_reason: 'Direct B2B partner distribution channel with HMAC signature security',
      level: 'L3',
      status: 'active',
    },
    {
      id: 'dest-assisted-001',
      name: 'High-Touch Subreddit Community',
      url: 'https://community.example.com/r/nichetech',
      platform_key: 'assisted',
      surface: 'post',
      category: 'community',
      audience_tags: ['founders', 'ai'],
      language: 'en',
      geo: 'global',
      est_audience: 85000,
      rules_url: 'https://community.example.com/r/nichetech/about/rules',
      frequency_cap: { max_posts: 1, window_days: 14 },
      self_promo_allowed: false,
      link_policy: 'prohibited',
      disclosure_required: true,
      automation_allowed: false,
      connector_key: 'assisted',
      relevance_score: 4.7,
      relevance_reason: 'High-value manual community; bot posts prohibited, requires assist pack',
      level: 'L1',
      status: 'active',
    },
  ];

  for (const dest of destinations) {
    await prisma.destination.upsert({
      where: {
        url_platform_key: {
          url: dest.url,
          platform_key: dest.platform_key,
        },
      },
      update: dest,
      create: dest,
    });
  }

  console.log(`✅ Seeded ${destinations.length} destinations.`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
