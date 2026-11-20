import { dbRepository, DestinationRecord } from '../database/repository.js';
import { connectorRegistry } from '@incubrix/connectors';
import { logger } from '../utils/logger.js';

export interface RecertificationOutcome {
  destination_id: string;
  destination_name: string;
  platform_key: string;
  success: boolean;
  previous_status: string;
  new_status: string;
  certified_at?: Date;
  error?: string;
  steps_completed: string[];
}

export interface RecertificationSummary {
  run_at: Date;
  total_checked: number;
  certified_count: number;
  demoted_count: number;
  outcomes: RecertificationOutcome[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class RecertificationService {
  /**
   * Recertifies a single destination by running the 4-step pipeline:
   * 1. Validate spec & connection
   * 2. Test publish (synthetic post)
   * 3. Get status check
   * 4. Deletion cleanup
   * Demotes destination on any failure.
   */
  public async recertifyDestination(dest: DestinationRecord): Promise<RecertificationOutcome> {
    const stepsCompleted: string[] = [];
    const previousStatus = dest.status;

    try {
      if (!connectorRegistry.has(dest.connector_key)) {
        throw new Error(`Connector '${dest.connector_key}' is not registered`);
      }

      const connector = connectorRegistry.get(dest.connector_key);
      const connection = {
        base_url: dest.url,
        api_key: 'test_cert_token',
        token: 'test_cert_token',
        channel: '#recert-test',
      };

      const syntheticRendition = {
        title: `[CERT-TEST] Automated Recertification Probe ${Date.now()}`,
        body: 'System automated certification probe to verify API health, idempotency and cleanup contract.',
        tags: ['certification', 'healthcheck'],
      };

      // Step 1: Validate
      const val = await connector.validate({
        destination: dest as any,
        rendition: syntheticRendition,
        connection,
      });

      if (!val.ok) {
        throw new Error(`Validation failed: ${val.violations.map((v) => v.message).join('; ')}`);
      }
      stepsCompleted.push('validate');

      // Step 2: Test Publish
      const pubResult = await connector.publish({
        destination: dest as any,
        rendition: syntheticRendition,
        connection,
        idempotency_key: `cert-${dest.id}-${Date.now()}`,
        is_test: true,
      });

      if (!pubResult.platform_post_id) {
        throw new Error('Publish step did not return a valid platform_post_id');
      }
      stepsCompleted.push('publish');

      // Step 3: Get Status
      const statusRes = await connector.getStatus({
        platform_post_id: pubResult.platform_post_id,
        connection,
      });

      if (statusRes.status !== 'published') {
        throw new Error(`Status check returned '${statusRes.status}', expected 'published'`);
      }
      stepsCompleted.push('get_status');

      // Step 4: Deletion cleanup
      await connector.delete({
        platform_post_id: pubResult.platform_post_id,
        connection,
      });
      stepsCompleted.push('delete');

      // Success: update destination to active & update certified_at
      const now = new Date();
      await dbRepository.updateDestination(dest.id, {
        status: 'active',
        last_certified_at: now,
      });

      logger.info(`Destination '${dest.id}' (${dest.name}) successfully recertified.`);

      return {
        destination_id: dest.id,
        destination_name: dest.name,
        platform_key: dest.platform_key,
        success: true,
        previous_status: previousStatus,
        new_status: 'active',
        certified_at: now,
        steps_completed: stepsCompleted,
      };
    } catch (err: any) {
      // Failure: demote destination and emit alert
      const errorMessage = err?.message || 'Unknown recertification error';
      logger.error(`[ALERT] Recertification FAILED for destination '${dest.id}' (${dest.name}): ${errorMessage}. Demoting destination.`);

      await dbRepository.updateDestination(dest.id, {
        status: 'demoted',
      });

      return {
        destination_id: dest.id,
        destination_name: dest.name,
        platform_key: dest.platform_key,
        success: false,
        previous_status: previousStatus,
        new_status: 'demoted',
        error: errorMessage,
        steps_completed: stepsCompleted,
      };
    }
  }

  /**
   * Identifies all destinations whose certification is older than 30 days (or null)
   * and runs automated recertification.
   */
  public async recertifyDueDestinations(forceAll: boolean = false): Promise<RecertificationSummary> {
    const destinations = await dbRepository.listDestinations();
    const now = Date.now();

    const dueList = destinations.filter((dest) => {
      if (forceAll) return true;
      if (!dest.last_certified_at) return true;
      const elapsed = now - new Date(dest.last_certified_at).getTime();
      return elapsed >= THIRTY_DAYS_MS;
    });

    const outcomes: RecertificationOutcome[] = [];
    let certifiedCount = 0;
    let demotedCount = 0;

    for (const dest of dueList) {
      const outcome = await this.recertifyDestination(dest);
      outcomes.push(outcome);
      if (outcome.success) certifiedCount++;
      else demotedCount++;
    }

    return {
      run_at: new Date(),
      total_checked: dueList.length,
      certified_count: certifiedCount,
      demoted_count: demotedCount,
      outcomes,
    };
  }

  /**
   * Lists certification state across all destinations
   */
  public async listCertifications(): Promise<Array<{
    destination_id: string;
    name: string;
    platform_key: string;
    status: string;
    last_certified_at?: Date | null;
    days_since_certified?: number;
    recertification_due: boolean;
  }>> {
    const destinations = await dbRepository.listDestinations();
    const now = Date.now();

    return destinations.map((d) => {
      const certifiedAt = d.last_certified_at ? new Date(d.last_certified_at) : null;
      const daysSince = certifiedAt ? Math.floor((now - certifiedAt.getTime()) / (1000 * 60 * 60 * 24)) : undefined;
      const isDue = !certifiedAt || (daysSince !== undefined && daysSince >= 30);

      return {
        destination_id: d.id,
        name: d.name,
        platform_key: d.platform_key,
        status: d.status,
        last_certified_at: certifiedAt,
        days_since_certified: daysSince,
        recertification_due: isDue,
      };
    });
  }
}

export const recertificationService = new RecertificationService();
