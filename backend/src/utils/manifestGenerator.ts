import crypto from 'crypto';

export interface OutputManifest {
  manifest_version: string;
  provider: {
    model_name: string;
    version: string;
    ai_assisted: boolean;
    note: string;
  };
  settings: {
    simulation_mode: boolean;
    environment: string;
    connector_key: string;
    destination_id: string;
  };
  seed: number;
  timings: {
    started_at: string;
    finished_at: string;
    duration_ms: number;
  };
  cost_estimate: {
    currency: string;
    amount: number;
    description: string;
  };
  warnings: string[];
  licence: {
    type: string;
    commercial_usable: boolean;
    notice: string;
  };
}

export function generateOutputManifest(params: {
  connector_key: string;
  destination_id: string;
  started_at: number;
  warnings?: string[];
  is_ai_generated?: boolean;
}): OutputManifest {
  const finished_at = Date.now();
  const seed = Math.floor(Math.random() * 1000000);

  return {
    manifest_version: '1.0.0',
    provider: {
      model_name: params.is_ai_generated ? 'Gemini 3.8 Flash' : 'none (deterministic code)',
      version: '1.0.0',
      ai_assisted: params.is_ai_generated ?? false,
      note: params.is_ai_generated
        ? 'Content authored with AI assistant disclosure'
        : 'Deterministic operation: no AI model was used for execution',
    },
    settings: {
      simulation_mode: process.env.SIMULATION_MODE === 'true',
      environment: process.env.NODE_ENV || 'development',
      connector_key: params.connector_key,
      destination_id: params.destination_id,
    },
    seed,
    timings: {
      started_at: new Date(params.started_at).toISOString(),
      finished_at: new Date(finished_at).toISOString(),
      duration_ms: finished_at - params.started_at,
    },
    cost_estimate: {
      currency: 'USD',
      amount: 0.0,
      description: 'Zero marginal cost in local / simulation mode',
    },
    warnings: params.warnings || [],
    licence: {
      type: 'Apache-2.0 / MIT',
      commercial_usable: true,
      notice: 'IncuBrix Content Distribution Network — Shipped for commercial evaluation',
    },
  };
}
