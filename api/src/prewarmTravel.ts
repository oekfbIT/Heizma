/**
 * @file      prewarmTravel.ts – CLI: Fahrzeitmatrix vorab laden (npm run travel:prewarm -w api)
 * @layer     Backend · Skript
 * @siehe     docs/09-setup.md · docs/10-code-navigation.md
 */
/** Optional: Fahrzeitmatrix ohne Server laden. Normalerweise unnötig – Seed im Code + Aufwärmen beim Serverstart. */
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
