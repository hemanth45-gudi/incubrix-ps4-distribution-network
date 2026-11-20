import crypto from 'crypto';
import { dbRepository, JobRecord } from '../database/repository.js';
import { logger } from '../utils/logger.js';

export interface EnqueueJobParams {
  job_type: string;
  payload: any;
  callback_url?: string;
  executor: (updateProgress: (p: number) => Promise<void>) => Promise<any>;
}

export class JobManager {
  /**
   * Enqueues an async task, stores the job record, returns HTTP 202 payload,
   * and runs the executor in background.
   */
  async enqueue(params: EnqueueJobParams): Promise<JobRecord> {
    const job = await dbRepository.createJob(params.job_type, params.callback_url);

    // Launch async execution in background (without blocking response)
    setImmediate(async () => {
      await this.runJob(job.id, params);
    });

    return job;
  }

  private async runJob(jobId: string, params: EnqueueJobParams): Promise<void> {
    try {
      await dbRepository.updateJob(jobId, { status: 'running', progress: 10 });

      const progressUpdater = async (progress: number) => {
        await dbRepository.updateJob(jobId, { progress: Math.min(Math.max(progress, 0), 100) });
      };

      const result = await params.executor(progressUpdater);

      const completed = await dbRepository.updateJob(jobId, {
        status: 'succeeded',
        progress: 100,
        result,
      });

      logger.info(`Background job ${jobId} (${params.job_type}) completed successfully`);

      // Fire callback if registered
      if (params.callback_url && completed) {
        await this.fireCallback(params.callback_url, completed);
      }
    } catch (err: any) {
      logger.error(`Background job ${jobId} failed: ${err.message}`, {
        job_id: jobId,
        details: { stack: err.stack },
      });

      const failedJob = await dbRepository.updateJob(jobId, {
        status: 'failed',
        error: err.message || 'Background execution failed',
      });

      if (params.callback_url && failedJob) {
        await this.fireCallback(params.callback_url, failedJob);
      }
    }
  }

  private async fireCallback(callbackUrl: string, jobRecord: JobRecord): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.WEBHOOK_DEFAULT_SECRET || 'mock-webhook-secret-32-bytes-long!';
    const rawPayload = `${timestamp}.${JSON.stringify(jobRecord)}`;
    const signature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

    try {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-IncuBrix-Signature': signature,
          'X-IncuBrix-Timestamp': timestamp,
        },
        body: JSON.stringify(jobRecord),
      });
    } catch (err: any) {
      logger.warn(`Failed to dispatch job callback to ${callbackUrl}: ${err.message}`);
    }
  }

  async getJobStatus(jobId: string): Promise<JobRecord | null> {
    return dbRepository.getJob(jobId);
  }
}

export const jobManager = new JobManager();
