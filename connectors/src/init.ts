import path from 'path';
import fs from 'fs';
import { connectorRegistry } from './registry.js';
import { loadManifestFromFile } from './manifest.js';
import { DiscourseConnector } from './implementations/DiscourseConnector.js';
import { LemmyConnector } from './implementations/LemmyConnector.js';
import { DevtoConnector } from './implementations/DevtoConnector.js';
import { GhostConnector } from './implementations/GhostConnector.js';
import { WebhookConnector } from './implementations/WebhookConnector.js';
import { AssistedConnector } from './implementations/AssistedConnector.js';
import { HashnodeConnector } from './implementations/HashnodeConnector.js';
import { SlackConnector } from './implementations/SlackConnector.js';
import { PeerTubeConnector } from './implementations/PeerTubeConnector.js';
import { ConnectorManifest } from './types.js';

export function initializeConnectors(manifestDir?: string): void {
  // If registry already contains all 9 connectors, do nothing
  if (connectorRegistry.list().length >= 9) return;

  const resolvedDir =
    manifestDir ||
    path.resolve(process.cwd(), 'connectors/manifests') ||
    path.resolve(process.cwd(), '../connectors/manifests');

  const getManifest = (key: string): ConnectorManifest => {
    const fullPath = path.join(resolvedDir, `${key}.yaml`);
    if (fs.existsSync(fullPath)) {
      return loadManifestFromFile(fullPath);
    }
    const altPath = path.resolve(__dirname, `../manifests/${key}.yaml`);
    if (fs.existsSync(altPath)) {
      return loadManifestFromFile(altPath);
    }
    throw new Error(`Manifest file not found for connector: ${key} at ${fullPath}`);
  };

  const registerIfMissing = (key: string, createFn: (m: ConnectorManifest) => any) => {
    if (!connectorRegistry.has(key)) {
      const manifest = getManifest(key);
      connectorRegistry.register(createFn(manifest));
    }
  };

  registerIfMissing('discourse', (m) => new DiscourseConnector(m));
  registerIfMissing('lemmy', (m) => new LemmyConnector(m));
  registerIfMissing('devto', (m) => new DevtoConnector(m));
  registerIfMissing('ghost', (m) => new GhostConnector(m));
  registerIfMissing('webhook', (m) => new WebhookConnector(m));
  registerIfMissing('assisted', (m) => new AssistedConnector(m));
  registerIfMissing('hashnode', (m) => new HashnodeConnector(m));
  registerIfMissing('slack', (m) => new SlackConnector(m));
  registerIfMissing('peertube', (m) => new PeerTubeConnector(m));
}
