'use strict';

const { runPipeline } = require('../lib/pipeline');

(async () => {
  const result = await runPipeline();
  const summary = {
    scannedAt: result.scannedAt,
    degraded: result.degraded,
    intervalSec: result.intervalSec,
    stats: result.stats,
    errors: result.errors,
    sample: result.cards.slice(0, 5).map((c) => ({
      title: c.title,
      layer: c.layer,
      dirty: c.dirty,
      region: c.region,
      publishedAt: c.publishedAt,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
