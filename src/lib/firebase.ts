import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Support lazy reuse or new initializations
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// CRITICAL: Must use firestoreDatabaseId for custom provisioned databases under enterprise, forcing long-polling to bypass WebSocket restrictions in nested browsers/iframes.
// GitHub Sync Trigger: Added robust offline compatibility check to ensure multi-browser connections work seamlessly.
export const db = firebaseConfig.firestoreDatabaseId
  ? initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId)
  : initializeFirestore(app, { experimentalForceLongPolling: true });

export const auth = getAuth(app);

// Operational Types for diagnostics
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

/**
 * Encapsulates security rule boundary diagnostics.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
    operationType,
    path
  };
  console.error('Firestore Diagnostic Exception:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively removes all keys with undefined values from an object,
 * ensuring it is fully compatible with Firestore's write constraints.
 */
export function sanitizeFirestoreData<T extends object>(obj: T): T {
  const clean = (item: any): any => {
    if (item === null || item === undefined) return null;
    if (Array.isArray(item)) {
      return item.map(clean);
    }
    if (typeof item === 'object') {
      const copy: any = {};
      Object.keys(item).forEach((key) => {
        if (item[key] !== undefined) {
          copy[key] = clean(item[key]);
        }
      });
      return copy;
    }
    return item;
  };
  return clean(obj);
}

/**
 * Validates active client connections to firestore in real time.
 */
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection test: SUCCESS (Online)");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore status: Client appears to be offline. Verify credentials/Wi-Fi.");
    } else {
      console.log("Firestore test checked (standard offline/not found response, safe to proceed)");
    }
  }
}
