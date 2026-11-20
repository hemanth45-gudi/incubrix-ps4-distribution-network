import { IConnector } from './base.js';
import { ConnectorError } from './errors.js';

export class ConnectorRegistry {
  private connectors = new Map<string, IConnector>();

  /**
   * Register a connector instance. Rejects duplicate keys.
   */
  public register(connector: IConnector): void {
    if (!connector.key) {
      throw new ConnectorError('DEST_SPEC_VIOLATION', 'Cannot register a connector without a valid key', false, 400);
    }

    if (this.connectors.has(connector.key)) {
      throw new ConnectorError(
        'DEST_SPEC_VIOLATION',
        `Connector with key '${connector.key}' is already registered`,
        false,
        409
      );
    }

    this.connectors.set(connector.key, connector);
  }

  /**
   * Retrieve a connector by key.
   * Throws CONNECTOR_DISABLED if disabled.
   * Throws NOT_FOUND if unknown.
   */
  public get(key: string): IConnector {
    const connector = this.connectors.get(key);
    if (!connector) {
      throw new ConnectorError('CONNECTOR_DISABLED', `Connector '${key}' not found or not registered`, false, 404);
    }

    if (!connector.enabled) {
      throw new ConnectorError(
        'CONNECTOR_DISABLED',
        `Connector '${key}' kill switch is enabled. Publishing is paused.`,
        false,
        403
      );
    }

    return connector;
  }

  /**
   * Check if a connector is registered (regardless of enabled state)
   */
  public has(key: string): boolean {
    return this.connectors.has(key);
  }

  /**
   * List all registered connectors
   */
  public list(): IConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * List only active enabled connectors
   */
  public listEnabled(): IConnector[] {
    return this.list().filter((c) => c.enabled);
  }

  /**
   * Unregister a connector by key
   */
  public unregister(key: string): boolean {
    return this.connectors.delete(key);
  }

  /**
   * Disable a connector (Kill switch)
   */
  public disable(key: string): void {
    const connector = this.connectors.get(key);
    if (!connector) {
      throw new ConnectorError('CONNECTOR_DISABLED', `Connector '${key}' not found`, false, 404);
    }
    connector.enabled = false;
  }

  /**
   * Re-enable a disabled connector
   */
  public enable(key: string): void {
    const connector = this.connectors.get(key);
    if (!connector) {
      throw new ConnectorError('CONNECTOR_DISABLED', `Connector '${key}' not found`, false, 404);
    }
    connector.enabled = true;
  }

  /**
   * Clear all connectors (useful in test teardown)
   */
  public clear(): void {
    this.connectors.clear();
  }
}

export const connectorRegistry = new ConnectorRegistry();
