const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp();

const [, , uid, mode] = process.argv;
if (!uid) {
  console.error('Uso: npm run set-admin <UID>');
  process.exit(1);
}

const unset = mode === 'unset';

getAuth()
  .setCustomUserClaims(uid, unset ? null : { admin: true })
  .then(() =>
    console.log(
      unset
        ? `❌ claim admin removida de ${uid}`
        : `✅ claim admin aplicada a ${uid}`,
    ),
  )
  .catch(err => {
    console.error('Falha ao atualizar claims:', err);
    process.exit(1);
  });
