import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBFx8DjaMW-0iBkTlOp2SpGqr0ErWlDlek",
  authDomain: "categories-game-16c59.firebaseapp.com",
  projectId: "categories-game-16c59",
  storageBucket: "categories-game-16c59.firebasestorage.app",
  messagingSenderId: "849852085736",
  appId: "1:849852085736:web:ed1dee34004da8f23be05d",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

export type ConnectionCheck = {
  displayName: string;
  lastCheckedAt?: unknown;
  provider: "anonymous" | "google";
  uid: string;
};

export function signInAsGuest() {
  return signInAnonymously(auth);
}

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutCurrentUser() {
  return signOut(auth);
}

export async function writeConnectionCheck(user: User) {
  const provider = user.isAnonymous ? "anonymous" : "google";

  await setDoc(doc(db, "connectionChecks", user.uid), {
    displayName: user.displayName ?? "Guest player",
    lastCheckedAt: serverTimestamp(),
    provider,
    uid: user.uid,
  } satisfies ConnectionCheck);
}

export function subscribeToConnectionCheck(
  uid: string,
  onChange: (check: ConnectionCheck | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "connectionChecks", uid),
    (snapshot) => {
      onChange(snapshot.exists() ? (snapshot.data() as ConnectionCheck) : null);
    },
    onError,
  );
}
