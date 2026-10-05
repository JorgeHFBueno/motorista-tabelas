import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './firebaseAdmin.js';
import { mondayApiToken } from './mondayClient.js';
import { projectMondayParentToFirestore } from './mondayProjector.js';
import { readMondayBoard } from './mondaySync.js';

export async function reconcileMondayBoard(dependencies: { token: string; readBoard?: typeof readMondayBoard; firestore?: any } ) {
  const firestore = dependencies.firestore ?? db;
  const parents = await (dependencies.readBoard ?? readMondayBoard)(dependencies.token);
  const summary = { parents: parents.length, UPDATED: 0, NO_CHANGE: 0, ERROR: 0 };
  for (const parent of parents) {
    try {
      const result = await projectMondayParentToFirestore(firestore, parent);
      summary[result.result]++;
    } catch (error) {
      summary.ERROR++;
      console.error('MONDAY_RECONCILE_PARENT_FAILED', { parentItemId: parent.id, error: error instanceof Error ? error.message : 'ERROR' });
    }
  }
  console.info('MONDAY_RECONCILE', summary);
  return summary;
}

export const mondayReconcileScheduled = onSchedule({ schedule: 'every 30 minutes', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', secrets: [mondayApiToken] }, async () => {
  const token = mondayApiToken.value();
  if (!token) throw new Error('MONDAY_SECRET_UNAVAILABLE');
  await reconcileMondayBoard({ token });
});
