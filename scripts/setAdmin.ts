import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp();

const [, , uid] = process.argv;
if (!uid) {
  console.error('Usage: npm run set-admin <uid>');
  process.exit(1);
}

const unset = process.env.npm_lifecycle_event === 'unset-admin';
(async () => {
  try {
    await getAuth().setCustomUserClaims(uid, unset ? {} : { admin: true });
    console.log(unset ? `Admin claim removed for ${uid}` : `Admin claim set for ${uid}`);
  } catch (err) {
    console.error('Failed to update custom claims:', err);
    process.exit(1);
  }
})();