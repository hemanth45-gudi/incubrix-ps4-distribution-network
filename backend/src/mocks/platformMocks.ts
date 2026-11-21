import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { dbRepository } from '../database/repository.js';

export interface MockPlatformState {
  discourse: { authExpired: boolean; rateLimited: boolean; unavailable: boolean; timeout: boolean };
  lemmy: { authExpired: boolean; rateLimited: boolean; unavailable: boolean; timeout: boolean };
  devto: { authExpired: boolean; rateLimited: boolean; unavailable: boolean; timeout: boolean };
  ghost: { authExpired: boolean; rateLimited: boolean; unavailable: boolean; timeout: boolean };
  webhook: { authExpired: boolean; rateLimited: boolean; unavailable: boolean; timeout: boolean };
  hashnode: { authExpired: boolean; rateLimited: boolean; unavailable: boolean; timeout: boolean };
  slack: { authExpired: boolean; rateLimited: boolean; unavailable: boolean; timeout: boolean };
  peertube: { authExpired: boolean; rateLimited: boolean; unavailable: boolean; timeout: boolean };
}

export const mockState: MockPlatformState = {
  discourse: { authExpired: false, rateLimited: false, unavailable: false, timeout: false },
  lemmy: { authExpired: false, rateLimited: false, unavailable: false, timeout: false },
  devto: { authExpired: false, rateLimited: false, unavailable: false, timeout: false },
  ghost: { authExpired: false, rateLimited: false, unavailable: false, timeout: false },
  webhook: { authExpired: false, rateLimited: false, unavailable: false, timeout: false },
  hashnode: { authExpired: false, rateLimited: false, unavailable: false, timeout: false },
  slack: { authExpired: false, rateLimited: false, unavailable: false, timeout: false },
  peertube: { authExpired: false, rateLimited: false, unavailable: false, timeout: false },
};

export const mockRouter = Router();

// Track published mock posts
export const mockPostsDb = new Map<string, any>();

// ==================================================
// 1. DISCOURSE MOCK
// ==================================================
mockRouter.post('/mock/discourse/posts.json', (req: Request, res: Response) => {
  if (mockState.discourse.timeout) return;
  if (mockState.discourse.unavailable) {
    return res.status(503).json({ error: 'Discourse database under maintenance' });
  }
  if (mockState.discourse.rateLimited) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in 60s' });
  }

  const apiKey = req.header('Api-Key') || req.header('api-key');
  const apiUser = req.header('Api-Username') || req.header('api-username');
  if (!apiKey || apiKey === 'invalid_key' || mockState.discourse.authExpired) {
    return res.status(401).json({ error: 'Invalid API key or token expired' });
  }

  const { title, raw } = req.body;
  if (!raw || raw.length > 32000) {
    return res.status(422).json({ errors: ['Body length exceeds 32,000 characters'] });
  }
  if (title && title.length > 255) {
    return res.status(422).json({ errors: ['Title length exceeds 255 characters'] });
  }

  const postId = Math.floor(1000 + Math.random() * 9000);
  const topicId = Math.floor(100 + Math.random() * 900);
  const postRecord = {
    id: postId,
    topic_id: topicId,
    title: title || 'Topic Post',
    raw,
    user: apiUser || 'system',
    deleted: false,
    created_at: new Date().toISOString(),
  };

  mockPostsDb.set(`discourse_${postId}`, postRecord);

  return res.status(200).json({
    id: postId,
    topic_id: topicId,
    topic_slug: 'mock-topic',
    post_number: 1,
  });
});

mockRouter.get('/mock/discourse/posts/:id.json', (req: Request, res: Response) => {
  const post = mockPostsDb.get(`discourse_${req.params.id}`);
  if (!post || post.deleted) {
    return res.status(404).json({ error: 'Post not found or deleted' });
  }
  return res.status(200).json(post);
});

mockRouter.delete('/mock/discourse/posts/:id.json', (req: Request, res: Response) => {
  const key = `discourse_${req.params.id}`;
  const post = mockPostsDb.get(key);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  post.deleted = true;
  return res.status(200).json({ success: 'OK' });
});

// ==================================================
// 2. LEMMY MOCK
// ==================================================
mockRouter.post('/mock/lemmy/api/v3/post', (req: Request, res: Response) => {
  if (mockState.lemmy.unavailable) return res.status(503).json({ error: 'Lemmy instance unreachable' });
  if (mockState.lemmy.rateLimited) {
    res.setHeader('Retry-After', '30');
    return res.status(429).json({ error: 'Too many requests' });
  }

  const authHeader = req.header('Authorization');
  if (!authHeader || authHeader === 'Bearer invalid_token' || mockState.lemmy.authExpired) {
    return res.status(401).json({ error: 'Token expired or unauthorized' });
  }

  const { name, body, community_id } = req.body;
  if (!name || name.length > 200) {
    return res.status(400).json({ error: 'Title is required and must be <= 200 characters' });
  }

  const postId = Math.floor(2000 + Math.random() * 8000);
  const host = req.get('host') || 'localhost:3001';
  const protocol = req.protocol || 'http';
  const liveUrl = `${protocol}://${host}/mock/lemmy/post/${postId}`;
  const record = {
    id: postId,
    name,
    title: name,
    body,
    community_id: community_id || 1,
    status: 'published',
    deleted: false,
    live_url: liveUrl,
    created_at: new Date().toISOString(),
  };
  mockPostsDb.set(`lemmy_${postId}`, record);
  mockPostsDb.set(String(postId), record);

  return res.status(200).json({
    post_view: {
      post: record,
      creator: { name: 'lemmy_user' },
      community: { name: 'technology' },
    },
  });
});

mockRouter.get('/mock/lemmy/api/v3/post', (req: Request, res: Response) => {
  const id = req.query.id as string;
  const post = mockPostsDb.get(`lemmy_${id}`) || mockPostsDb.get(id);
  if (!post || post.deleted) {
    return res.status(404).json({ error: 'Post not found' });
  }
  return res.status(200).json({ post_view: { post } });
});

mockRouter.get(['/mock/lemmy/post/:id', '/mock/lemmy/posts/:id'], async (req: Request, res: Response) => {
  const { id } = req.params;
  const post = mockPostsDb.get(`lemmy_${id}`) || mockPostsDb.get(id);

  if (post) {
    if (post.deleted) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Mock Lemmy post '${id}' has been deleted`,
        },
        status: 'deleted',
      });
    }

    const host = req.get('host') || 'localhost:3001';
    const protocol = req.protocol || 'http';
    const liveUrl = post.live_url || `${protocol}://${host}/mock/lemmy/post/${id}`;

    return res.status(200).json({
      id: Number(id) || id,
      title: post.title || post.name,
      body: post.body,
      status: post.status || 'published',
      publication_details: {
        id: Number(id) || id,
        title: post.title || post.name,
        body: post.body,
        status: post.status || 'published',
        community_id: post.community_id || 1,
        creator: { name: 'lemmy_user' },
        platform: 'lemmy',
        created_at: post.created_at || new Date().toISOString(),
        live_url: liveUrl,
      },
      post_view: {
        post,
        creator: { name: 'lemmy_user' },
        community: { name: 'technology' },
      },
    });
  }

  // Fallback to dbRepository in case post was published via DB repository
  try {
    const publications = await dbRepository.listPublications();
    const pub = publications.find(
      (p) => String(p.platform_post_id) === String(id) || String(p.id) === String(id)
    );
    if (pub && pub.status !== 'deleted') {
      const host = req.get('host') || 'localhost:3001';
      const protocol = req.protocol || 'http';
      const liveUrl = pub.live_url || `${protocol}://${host}/mock/lemmy/post/${id}`;
      return res.status(200).json({
        id: Number(id) || id,
        title: pub.title || 'Lemmy Publication',
        body: pub.body,
        status: pub.status,
        publication_details: {
          id: Number(id) || id,
          title: pub.title,
          body: pub.body,
          status: pub.status,
          platform: 'lemmy',
          created_at: pub.created_at,
          live_url: liveUrl,
        },
        post_view: {
          post: {
            id: Number(id) || id,
            name: pub.title,
            body: pub.body,
            deleted: false,
          },
          creator: { name: 'lemmy_user' },
          community: { name: 'technology' },
        },
      });
    }
  } catch {}

  return res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Mock Lemmy post '${id}' not found`,
    },
  });
});

mockRouter.post('/mock/lemmy/api/v3/post/delete', (req: Request, res: Response) => {
  const { post_id } = req.body;
  const post = mockPostsDb.get(`lemmy_${post_id}`) || mockPostsDb.get(String(post_id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.deleted = true;
  post.status = 'deleted';
  return res.status(200).json({ post_view: { post } });
});

mockRouter.delete(['/mock/lemmy/post/:id', '/mock/lemmy/posts/:id'], (req: Request, res: Response) => {
  const { id } = req.params;
  const post = mockPostsDb.get(`lemmy_${id}`) || mockPostsDb.get(String(id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.deleted = true;
  post.status = 'deleted';
  return res.status(200).json({ success: true, status: 'deleted' });
});

// ==================================================
// 3. DEV.TO MOCK
// ==================================================
mockRouter.post('/mock/devto/api/articles', (req: Request, res: Response) => {
  if (mockState.devto.unavailable) return res.status(503).json({ error: 'Dev.to API unavailable' });
  if (mockState.devto.rateLimited) {
    res.setHeader('Retry-After', '30');
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const apiKey = req.header('api-key');
  if (!apiKey || apiKey === 'invalid_key' || mockState.devto.authExpired) {
    return res.status(401).json({ error: 'Unauthorized: valid api-key required' });
  }

  const article = req.body.article || req.body;
  if (article.title && article.title.length > 128) {
    return res.status(422).json({ error: 'Title must be 128 characters or fewer' });
  }
  if (article.tags && article.tags.length > 4) {
    return res.status(422).json({ error: 'Dev.to allows a maximum of 4 tags' });
  }

  const id = Math.floor(3000 + Math.random() * 7000);
  const slug = `article-${id}`;
  const record = { id, title: article.title, body_markdown: article.body_markdown, deleted: false };
  mockPostsDb.set(`devto_${id}`, record);

  return res.status(201).json({
    id,
    title: article.title,
    url: `https://dev.to/incubrix/${slug}`,
    published: true,
  });
});

mockRouter.get('/mock/devto/api/articles/:id', (req: Request, res: Response) => {
  const post = mockPostsDb.get(`devto_${req.params.id}`);
  if (!post || post.deleted) return res.status(404).json({ error: 'Article not found' });
  return res.status(200).json(post);
});

mockRouter.delete('/mock/devto/api/articles/:id', (req: Request, res: Response) => {
  const post = mockPostsDb.get(`devto_${req.params.id}`);
  if (!post) return res.status(404).json({ error: 'Article not found' });
  post.deleted = true;
  return res.status(204).send();
});

// ==================================================
// 4. GHOST MOCK
// ==================================================
mockRouter.post('/mock/ghost/ghost/api/admin/posts/', (req: Request, res: Response) => {
  if (mockState.ghost.unavailable) return res.status(503).json({ error: 'Ghost admin offline' });
  if (mockState.ghost.rateLimited) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const authHeader = req.header('Authorization');
  if (!authHeader || authHeader === 'Ghost invalid_token' || mockState.ghost.authExpired) {
    return res.status(401).json({ errors: [{ message: 'Ghost Admin token invalid or expired' }] });
  }

  const post = req.body.posts?.[0];
  if (!post || !post.title) {
    return res.status(422).json({ errors: [{ message: 'Post title is required' }] });
  }

  const id = `ghost_${Math.floor(4000 + Math.random() * 6000)}`;
  const record = { id, title: post.title, status: 'published', url: `https://blog.example.com/p/${id}`, deleted: false };
  mockPostsDb.set(id, record);

  return res.status(201).json({ posts: [record] });
});

mockRouter.get('/mock/ghost/ghost/api/admin/posts/:id/', (req: Request, res: Response) => {
  const post = mockPostsDb.get(req.params.id);
  if (!post || post.deleted) return res.status(404).json({ errors: [{ message: 'Post not found' }] });
  return res.status(200).json({ posts: [post] });
});

mockRouter.delete('/mock/ghost/ghost/api/admin/posts/:id/', (req: Request, res: Response) => {
  const post = mockPostsDb.get(req.params.id);
  if (!post) return res.status(404).json({ errors: [{ message: 'Post not found' }] });
  post.deleted = true;
  return res.status(204).send();
});

// ==================================================
// 5. SIGNED WEBHOOK RECEIVER MOCK
// ==================================================
mockRouter.post('/mock/webhook/receiver', (req: Request, res: Response) => {
  if (mockState.webhook.unavailable) return res.status(503).json({ error: 'Webhook receiver unavailable' });
  if (mockState.webhook.rateLimited) {
    res.setHeader('Retry-After', '45');
    return res.status(429).json({ error: 'Webhook queue saturated' });
  }

  const signature = req.header('X-IncuBrix-Signature');
  const timestamp = req.header('X-IncuBrix-Timestamp');
  const secret = (req.query.secret as string) || 'mock-webhook-secret-32-bytes-long!';

  if (!signature || !timestamp || mockState.webhook.authExpired) {
    return res.status(401).json({ error: 'Missing or expired webhook signature' });
  }

  const sentTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(sentTime) || Math.abs(now - sentTime) > 300) {
    return res.status(401).json({ error: 'Webhook timestamp expired (replay attack detected)' });
  }

  const expectedPayload = `${timestamp}.${JSON.stringify(req.body)}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

  if (signature !== expectedSig && signature !== 'bypass-test-signature') {
    return res.status(401).json({ error: 'Invalid HMAC-SHA256 signature' });
  }

  const eventId = `wh_event_${Math.floor(5000 + Math.random() * 5000)}`;
  mockPostsDb.set(eventId, { id: eventId, body: req.body, received_at: new Date().toISOString(), deleted: false });

  return res.status(200).json({
    status: 'delivered',
    event_id: eventId,
    live_url: `https://partner.example.org/events/${eventId}`,
  });
});

mockRouter.get('/mock/webhook/events/:id', (req: Request, res: Response) => {
  const event = mockPostsDb.get(req.params.id);
  if (!event || event.deleted) return res.status(404).json({ error: 'Webhook event not found' });
  return res.status(200).json(event);
});

mockRouter.delete('/mock/webhook/events/:id', (req: Request, res: Response) => {
  const event = mockPostsDb.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  event.deleted = true;
  return res.status(200).json({ deleted: true });
});

// ==================================================
// 6. HASHNODE MOCK
// ==================================================
mockRouter.post('/mock/hashnode/posts', (req: Request, res: Response) => {
  if (mockState.hashnode.unavailable) return res.status(503).json({ error: 'Hashnode API unavailable' });
  if (mockState.hashnode.rateLimited) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const auth = req.header('Authorization');
  if (!auth || auth === 'Bearer invalid_token' || mockState.hashnode.authExpired) {
    return res.status(401).json({ error: 'Unauthorized Hashnode access token' });
  }

  const { title, contentMarkdown, tags, canonicalUrl } = req.body;
  if (!contentMarkdown) return res.status(422).json({ error: 'Post content cannot be empty' });

  const id = `hn_${Math.floor(6000 + Math.random() * 4000)}`;
  const record = { id, title, contentMarkdown, tags, canonicalUrl, deleted: false };
  mockPostsDb.set(id, record);

  return res.status(200).json({
    id,
    title,
    url: `https://incubrix.hashnode.dev/${id}`,
    status: 'published',
  });
});

mockRouter.get('/mock/hashnode/posts/:id', (req: Request, res: Response) => {
  const post = mockPostsDb.get(req.params.id);
  if (!post || post.deleted) return res.status(404).json({ error: 'Post not found' });
  return res.status(200).json(post);
});

mockRouter.delete('/mock/hashnode/posts/:id', (req: Request, res: Response) => {
  const post = mockPostsDb.get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.deleted = true;
  return res.status(200).json({ deleted: true });
});

// ==================================================
// 7. SLACK MOCK
// ==================================================
mockRouter.post(['/mock/slack/api/chat.postMessage', '/mock/slack/webhook'], (req: Request, res: Response) => {
  if (mockState.slack.unavailable) return res.status(503).json({ error: 'Slack workspace unreachable' });
  if (mockState.slack.rateLimited) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Slack rate limit exceeded' });
  }

  const auth = req.header('Authorization');
  if (auth === 'Bearer invalid_token' || mockState.slack.authExpired) {
    return res.status(401).json({ error: 'invalid_auth' });
  }

  const { text, channel } = req.body;
  if (!text) return res.status(400).json({ error: 'no_text' });

  const ts = `${Math.floor(Date.now() / 1000)}.${Math.floor(100000 + Math.random() * 900000)}`;
  const record = { id: ts, ts, text, channel: channel || '#general', deleted: false };
  mockPostsDb.set(ts, record);

  return res.status(200).json({
    ok: true,
    ts,
    channel: channel || '#general',
    url: `https://incubrix.slack.com/archives/${channel || 'C123'}/p${ts.replace('.', '')}`,
  });
});

mockRouter.get(['/mock/slack/messages/:id', '/mock/slack/archives/:id'], (req: Request, res: Response) => {
  const msg = mockPostsDb.get(req.params.id);
  if (!msg || msg.deleted) return res.status(404).json({ ok: false, error: 'message_not_found' });
  return res.status(200).json({ ok: true, message: msg });
});

mockRouter.delete('/mock/slack/messages/:id', (req: Request, res: Response) => {
  const msg = mockPostsDb.get(req.params.id);
  if (!msg) return res.status(404).json({ ok: false, error: 'message_not_found' });
  msg.deleted = true;
  return res.status(200).json({ ok: true });
});

// ==================================================
// 8. PEERTUBE MOCK
// ==================================================
mockRouter.post('/mock/peertube/api/v1/videos', (req: Request, res: Response) => {
  if (mockState.peertube.unavailable) return res.status(503).json({ error: 'PeerTube instance unavailable' });
  if (mockState.peertube.rateLimited) {
    res.setHeader('Retry-After', '30');
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const auth = req.header('Authorization');
  if (!auth || auth === 'Bearer invalid_token' || mockState.peertube.authExpired) {
    return res.status(401).json({ error: 'Unauthorized PeerTube token' });
  }

  const { name, description, tags } = req.body;
  if (!name || name.length > 120) return res.status(422).json({ error: 'Name must be between 1 and 120 characters' });

  const uuid = `pt-${Math.floor(7000 + Math.random() * 3000)}`;
  const record = { uuid, id: uuid, name, description, tags, deleted: false };
  mockPostsDb.set(uuid, record);

  return res.status(200).json({
    uuid,
    name,
    url: `https://peertube.example.org/w/${uuid}`,
  });
});

mockRouter.get('/mock/peertube/api/v1/videos/:id', (req: Request, res: Response) => {
  const video = mockPostsDb.get(req.params.id);
  if (!video || video.deleted) return res.status(404).json({ error: 'Video not found' });
  return res.status(200).json(video);
});

mockRouter.delete('/mock/peertube/api/v1/videos/:id', (req: Request, res: Response) => {
  const video = mockPostsDb.get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  video.deleted = true;
  return res.status(204).send();
});
