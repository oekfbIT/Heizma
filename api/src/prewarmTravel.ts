/** Fahrzeitmatrix vorab laden: npm run travel:prewarm -w api  (dauert beim ersten Mal einige Minuten) */
import { loadDataset } from './heizmaClient.js';
import { applyOverrides } from './localStore.js';
import { getTravelMatrix } from './travelMatrix.js';

(async () => {
  const data = applyOverrides(await loadDataset());
  const { stats } = await getTravelMatrix(data, { log: true });
  console.log('[travel] fertig:', stats);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
