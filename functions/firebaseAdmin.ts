import * as admin from 'firebase-admin';

// Initialize Admin SDK once for all Cloud Functions consumers.
if (!admin.apps.length) {
  admin.initializeApp();
}

export { admin };