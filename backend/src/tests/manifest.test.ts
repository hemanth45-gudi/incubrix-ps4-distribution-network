import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  loadAllManifests,
  loadManifestFromFile,
  parseAndValidateManifest,
  ConnectorManifestSchema,
} from '@incubrix/connectors';

describe('Connector Manifest Validation Tests', () => {
  const manifestsDir = path.resolve(process.cwd(), '../connectors/manifests');

  const requiredManifests = ['discourse', 'lemmy', 'devto', 'ghost', 'webhook', 'assisted'];

  for (const name of requiredManifests) {
    it(`validates ${name}.yaml against ConnectorManifestSchema`, () => {
      const filePath = path.join(manifestsDir, `${name}.yaml`);
      const manifest = loadManifestFromFile(filePath);

      expect(manifest.key).toBe(name);
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(['native', 'protocol', 'bridge', 'feed', 'assisted']).toContain(manifest.tier);
      expect(['api_key', 'bearer_token', 'hmac_sha256', 'oauth2', 'none']).toContain(manifest.auth);
      expect(manifest.surfaces.length).toBeGreaterThan(0);
      expect(manifest.capabilities.length).toBeGreaterThan(0);
      expect(manifest.error_map).toBeDefined();

      if (name !== 'assisted') {
        expect(manifest.error_map['429']).toBe('PLATFORM_RATE_LIMIT');
      }
    });
  }

  it('rejects manifest with invalid semver version', () => {
    const invalid = {
      key: 'test',
      version: 'invalid-version',
      tier: 'native',
      auth: 'api_key',
      surfaces: [{ key: 'default', content_types: ['text'], spec: {} }],
      capabilities: ['publish'],
      error_map: {},
    };

    expect(() => parseAndValidateManifest(invalid)).toThrow();
  });

  it('rejects manifest with unsupported tier', () => {
    const invalid = {
      key: 'test',
      version: '1.0.0',
      tier: 'unsupported-tier',
      auth: 'api_key',
      surfaces: [{ key: 'default', content_types: ['text'], spec: {} }],
      capabilities: ['publish'],
      error_map: {},
    };

    expect(() => parseAndValidateManifest(invalid)).toThrow();
  });

  it('rejects manifest without any capabilities', () => {
    const invalid = {
      key: 'test',
      version: '1.0.0',
      tier: 'native',
      auth: 'api_key',
      surfaces: [{ key: 'default', content_types: ['text'], spec: {} }],
      capabilities: [],
      error_map: {},
    };

    expect(() => parseAndValidateManifest(invalid)).toThrow();
  });
});
