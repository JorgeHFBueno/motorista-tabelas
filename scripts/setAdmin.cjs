const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp();

const [, , maybeUid, maybeFlag] = process.argv;

const unsetMode = maybeUid === 'unset';
const uid = unsetMode ? maybeFlag : maybeUid;

if (!uid) {
  console.error('Uso:\n  npm run set-admin <UID>\n  npm run unset-admin <UID>');
  process.exit(1);
}

getAuth()
  .setCustomUserClaims(uid, unsetMode ? null : { admin: true })
  .then(() =>
    console.log(
      unsetMode
        ? `claim admin removida de ${uid}`
        : `claim admin aplicada a ${uid}`,
    ),
  )
  .catch(err => {
    console.error('Falha ao atualizar claims:', err);
    process.exit(1);
  });
