import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectorRegistry, BaseConnector, ConnectorManifest } from '@incubrix/connectors';

describe('Connector Registry Tests', () => {
  let registry: ConnectorRegistry;

  const mockManifest: ConnectorManifest = {
    key: 'test-connector',
    version: '1.0.0',
    tier: 'native',
    auth: 'api_key',
    surfaces: [{ key: 'default', content_types: ['text'], spec: {} }],
    capabilities: ['publish', 'status', 'delete'],
    error_map: {},
  };

  class TestConnector extends BaseConnector {
    async publish(): Promise<any> {
      return { platform_post_id: '1', live_url: 'http://test', status: 'published' };
    }
    async getStatus(): Promise<any> {
      return { status: 'published', live_url: 'http://test' };
    }
    async delete(): Promise<any> {
      return { deleted: true };
    }
  }

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it('registers and retrieves a connector', () => {
    const conn = new TestConnector(mockManifest);
    registry.register(conn);

    expect(registry.has('test-connector')).toBe(true);
    expect(registry.get('test-connector')).toBe(conn);
    expect(registry.list()).toHaveLength(1);
  });

  it('rejects duplicate connector registration', () => {
    const conn1 = new TestConnector(mockManifest);
    const conn2 = new TestConnector(mockManifest);

    registry.register(conn1);
    expect(() => registry.register(conn2)).toThrow(/already registered/);
  });

  it('throws when getting an unregistered connector', () => {
    expect(() => registry.get('non-existent')).toThrow(/not found or not registered/);
  });

  it('supports disabling and re-enabling via kill switch', () => {
    const conn = new TestConnector(mockManifest);
    registry.register(conn);

    registry.disable('test-connector');
    expect(() => registry.get('test-connector')).toThrow(/kill switch is enabled/);

    registry.enable('test-connector');
    expect(registry.get('test-connector')).toBe(conn);
  });

  it('unregisters a connector cleanly', () => {
    const conn = new TestConnector(mockManifest);
    registry.register(conn);

    const unregistered = registry.unregister('test-connector');
    expect(unregistered).toBe(true);
    expect(registry.has('test-connector')).toBe(false);
  });
});
