import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface BatchItem {
  id?: string;
  destination_id: string;
  rendition: {
    title?: string;
    body: string;
    tags?: string[];
    canonical_url?: string;
    is_ai_generated?: boolean;
    ai_disclosure?: string;
  };
  connection?: Record<string, any>;
  expected_status?: number;
}

interface BatchReportItem {
  index: number;
  id: string;
  destination_id: string;
  idempotency_key: string;
  http_status: number;
  expected_status?: number;
  status: 'SUCCESS' | 'FAILED' | 'EXPECTED_ERROR';
  response: any;
  duration_ms: number;
}

async function main() {
  const args = process.argv.slice(2);
  const inputArgIndex = args.indexOf('--input');
  const inputPath = inputArgIndex !== -1 ? args[inputArgIndex + 1] : 'scripts/batch-runner/sample-batch.json';
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3001';

  console.log('🚀 IncuBrix CLI Batch Runner');
  console.log(`📂 Input Path: ${inputPath}`);
  console.log(`🌐 Target API: ${apiBaseUrl}`);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(inputPath, 'utf8');
  let items: BatchItem[] = [];
  try {
    items = JSON.parse(fileContent);
  } catch (err: any) {
    console.error(`❌ Failed to parse JSON input: ${err.message}`);
    process.exit(1);
  }

  console.log(`📋 Found ${items.length} items to process in batch.\n`);

  const resultsDir = path.resolve(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const reports: BatchReportItem[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemId = item.id || `item-${i + 1}`;
    const idempotencyKey = `batch-idem-${itemId}-${crypto.randomBytes(4).toString('hex')}`;
    const start = Date.now();

    console.log(`[${i + 1}/${items.length}] Publishing to '${item.destination_id}' (Key: ${idempotencyKey})...`);

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Correlation-Id': `batch-corr-${itemId}`,
        },
        body: JSON.stringify({
          destination_id: item.destination_id,
          rendition: item.rendition,
          connection: item.connection || {},
        }),
      });

      const duration_ms = Date.now() - start;
      const data = await res.json().catch(() => ({}));

      let status: BatchReportItem['status'] = 'SUCCESS';
      if (!res.ok) {
        if (item.expected_status && res.status === item.expected_status) {
          status = 'EXPECTED_ERROR';
        } else {
          status = 'FAILED';
        }
      }

      if (status === 'SUCCESS' || status === 'EXPECTED_ERROR') {
        successCount++;
        console.log(`   ✅ Status ${res.status} (${duration_ms}ms) -> ${status}`);
      } else {
        failCount++;
        console.log(`   ❌ Status ${res.status} (${duration_ms}ms) -> ${data.error?.code || 'ERROR'}`);
      }

      reports.push({
        index: i + 1,
        id: itemId,
        destination_id: item.destination_id,
        idempotency_key: idempotencyKey,
        http_status: res.status,
        expected_status: item.expected_status,
        status,
        response: data,
        duration_ms,
      });
    } catch (err: any) {
      failCount++;
      const duration_ms = Date.now() - start;
      console.log(`   ❌ Network error: ${err.message}`);
      reports.push({
        index: i + 1,
        id: itemId,
        destination_id: item.destination_id,
        idempotency_key: idempotencyKey,
        http_status: 0,
        expected_status: item.expected_status,
        status: 'FAILED',
        response: { error: err.message },
        duration_ms,
      });
    }
  }

  const summary = {
    executed_at: new Date().toISOString(),
    total_items: items.length,
    successes: successCount,
    failures: failCount,
    items: reports,
  };

  const summaryFile = path.join(resultsDir, `batch-summary-${Date.now()}.json`);
  const latestSummary = path.join(resultsDir, 'batch-summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  fs.writeFileSync(latestSummary, JSON.stringify(summary, null, 2));

  console.log('\n==================================================');
  console.log('BATCH EXECUTION SUMMARY');
  console.log('==================================================');
  console.log(`Total: ${items.length} | Success / Handled: ${successCount} | Unhandled Failures: ${failCount}`);
  console.log(`📄 Saved summary report to: ${latestSummary}`);
  console.log('==================================================\n');
}

main().catch((err) => {
  console.error('Fatal batch runner error:', err);
  process.exit(1);
});
