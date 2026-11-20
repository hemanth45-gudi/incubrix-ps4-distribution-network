import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { ConnectorManifest, StandardErrorCode } from './types.js';

const standardErrorCodes: [StandardErrorCode, ...StandardErrorCode[]] = [
  'DEST_SPEC_VIOLATION',
  'DEST_RULE_FREQUENCY_CAP',
  'CONNECTION_AUTH_EXPIRED',
  'PLATFORM_RATE_LIMIT',
  'PLATFORM_QUOTA_EXHAUSTED',
  'PLATFORM_CONTENT_REJECTED',
  'PLATFORM_UNAVAILABLE',
  'CONNECTOR_DISABLED',
];

export const ConnectorManifestSchema = z.object({
  key: z.string().min(1, 'Connector key is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be valid semver (e.g. 1.0.0)'),
  tier: z.enum(['native', 'protocol', 'bridge', 'feed', 'assisted']),
  auth: z.enum(['api_key', 'bearer_token', 'hmac_sha256', 'oauth2', 'none']),
  surfaces: z
    .array(
      z.object({
        key: z.string().min(1),
        content_types: z.array(z.string()).min(1),
        spec: z.object({
          title_max_chars: z.number().int().positive().optional(),
          body_max_chars: z.number().int().positive().optional(),
          links_allowed: z.boolean().optional(),
          max_tags: z.number().int().nonnegative().optional(),
          supported_media_formats: z.array(z.string()).optional(),
        }),
      })
    )
    .min(1, 'At least one surface is required'),
  rate_limits: z
    .object({
      per_connection: z
        .object({
          requests: z.number().int().positive(),
          per_seconds: z.number().int().positive(),
        })
        .optional(),
    })
    .optional(),
  capabilities: z
    .array(z.enum(['publish', 'status', 'delete', 'metrics', 'refresh_auth', 'build_assist_pack']))
    .min(1, 'At least one capability must be declared'),
  error_map: z.record(z.string(), z.enum(standardErrorCodes)),
  instance_param: z.string().optional(),
});

export function parseAndValidateManifest(raw: unknown): ConnectorManifest {
  return ConnectorManifestSchema.parse(raw) as ConnectorManifest;
}

export function loadManifestFromString(content: string): ConnectorManifest {
  const parsed = yaml.load(content);
  return parseAndValidateManifest(parsed);
}

export function loadManifestFromFile(filePath: string): ConnectorManifest {
  const content = fs.readFileSync(filePath, 'utf8');
  return loadManifestFromString(content);
}

export function loadAllManifests(dirPath: string): Map<string, ConnectorManifest> {
  const manifests = new Map<string, ConnectorManifest>();
  if (!fs.existsSync(dirPath)) {
    return manifests;
  }

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const manifest = loadManifestFromFile(fullPath);
    manifests.set(manifest.key, manifest);
  }

  return manifests;
}
