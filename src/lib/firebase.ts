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
  collection,
  doc,
  getDoc,
  getFirestore,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
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

export type RoomStatus = "lobby" | "playing" | "reviewing" | "scoring" | "finished";

export type RoomSettings = {
  categoriesPerRound: number;
  categorySource: "random" | "pack" | "custom";
  excludedLetters: string[];
  timerSeconds: number;
  totalRounds: number;
};

export type Room = {
  code: string;
  createdAt?: unknown;
  currentCategories?: string[];
  currentLetter?: string;
  currentRound: number;
  hostUid: string;
  lastActivityAt?: unknown;
  letterPickerOrder: string[];
  settings: RoomSettings;
  status: RoomStatus;
};

export type Player = {
  avatar: string;
  connected: boolean;
  displayName: string;
  joinedAt?: unknown;
  lastSeenAt?: unknown;
  score: number;
  uid: string;
};

export type Round = {
  answerPoints?: Record<string, number[]>;
  categories: string[];
  endedAt?: unknown;
  letter: string;
  scores?: Record<string, number>;
  startedAt?: unknown;
};

export type RoundAnswer = {
  submittedAt?: unknown;
  uid: string;
  values: Record<string, string>;
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

function getDisplayName(user: User) {
  return user.displayName?.trim() || "Guest player";
}

function getAvatar(user: User) {
  const name = getDisplayName(user);
  return name[0]?.toUpperCase() ?? "G";
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codeLength = 4;

  return Array.from({ length: codeLength }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

function roomRef(roomCode: string) {
  return doc(db, "rooms", roomCode.toUpperCase());
}

function playerRef(roomCode: string, uid: string) {
  return doc(db, "rooms", roomCode.toUpperCase(), "players", uid);
}

function roundRef(roomCode: string, roundNumber: number) {
  return doc(db, "rooms", roomCode.toUpperCase(), "rounds", String(roundNumber));
}

function answerRef(roomCode: string, roundNumber: number, uid: string) {
  return doc(
    db,
    "rooms",
    roomCode.toUpperCase(),
    "rounds",
    String(roundNumber),
    "answers",
    uid,
  );
}

async function addCurrentPlayerToRoom(roomCode: string, user: User) {
  await setDoc(
    playerRef(roomCode, user.uid),
    {
      avatar: getAvatar(user),
      connected: true,
      displayName: getDisplayName(user),
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      score: 0,
      uid: user.uid,
    } satisfies Player,
    { merge: true },
  );
}

export async function createRoom(user: User) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createRoomCode();
    const existingRoom = await getDoc(roomRef(code));

    if (existingRoom.exists()) {
      continue;
    }

    await setDoc(roomRef(code), {
      code,
      createdAt: serverTimestamp(),
      currentRound: 0,
      hostUid: user.uid,
      lastActivityAt: serverTimestamp(),
      letterPickerOrder: [user.uid],
      settings: {
        categoriesPerRound: 10,
        categorySource: "random",
        excludedLetters: ["Q", "X", "Z"],
        timerSeconds: 90,
        totalRounds: 5,
      },
      status: "lobby",
    } satisfies Room);

    await addCurrentPlayerToRoom(code, user);
    return code;
  }

  throw new Error("Could not create a unique room code. Try again.");
}

export async function joinRoom(roomCode: string, user: User) {
  const normalizedCode = roomCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{4,6}$/.test(normalizedCode)) {
    throw new Error("Enter a valid room code.");
  }

  const roomSnapshot = await getDoc(roomRef(normalizedCode));

  if (!roomSnapshot.exists()) {
    throw new Error("No room found with that code.");
  }

  await addCurrentPlayerToRoom(normalizedCode, user);

  return normalizedCode;
}

export async function leaveRoom(roomCode: string, user: User) {
  await setDoc(
    playerRef(roomCode, user.uid),
    {
      connected: false,
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribeToRoom(
  roomCode: string,
  onChange: (room: Room | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    roomRef(roomCode),
    (snapshot) => {
      onChange(snapshot.exists() ? (snapshot.data() as Room) : null);
    },
    onError,
  );
}

export function subscribeToRoomPlayers(
  roomCode: string,
  onChange: (players: Player[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "rooms", roomCode.toUpperCase(), "players"), orderBy("joinedAt")),
    (snapshot) => {
      onChange(snapshot.docs.map((playerDoc) => playerDoc.data() as Player));
    },
    onError,
  );
}

const defaultRoundCategories = [
  "Animal",
  "Things you find in a kitchen",
  "Famous landmarks",
  "Foods you eat with your hands",
  "Things that come in pairs",
];

function drawLetter(excludedLetters: string[]) {
  const excluded = new Set(excludedLetters);
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .filter((letter) => !excluded.has(letter));

  return letters[Math.floor(Math.random() * letters.length)];
}

export async function startNextRound(roomCode: string, room: Room) {
  const roundNumber = room.currentRound + 1;
  const letter = drawLetter(room.settings.excludedLetters);
  const categories = defaultRoundCategories.slice(0, room.settings.categoriesPerRound);

  await setDoc(roundRef(roomCode, roundNumber), {
    categories,
    letter,
    startedAt: serverTimestamp(),
  } satisfies Round);

  await updateDoc(roomRef(roomCode), {
    currentCategories: categories,
    currentLetter: letter,
    currentRound: roundNumber,
    lastActivityAt: serverTimestamp(),
    status: "playing",
  });
}

export async function submitRoundAnswers(
  roomCode: string,
  roundNumber: number,
  user: User,
  values: Record<string, string>,
) {
  await setDoc(answerRef(roomCode, roundNumber, user.uid), {
    submittedAt: serverTimestamp(),
    uid: user.uid,
    values,
  } satisfies RoundAnswer);
}

export function subscribeToRound(
  roomCode: string,
  roundNumber: number,
  onChange: (round: Round | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    roundRef(roomCode, roundNumber),
    (snapshot) => {
      onChange(snapshot.exists() ? (snapshot.data() as Round) : null);
    },
    onError,
  );
}

export function subscribeToRoundAnswers(
  roomCode: string,
  roundNumber: number,
  onChange: (answers: RoundAnswer[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, "rooms", roomCode.toUpperCase(), "rounds", String(roundNumber), "answers"),
    (snapshot) => {
      onChange(snapshot.docs.map((answerDoc) => answerDoc.data() as RoundAnswer));
    },
    onError,
  );
}

function normalizeAnswer(answer: string) {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function revealRoundScores(
  roomCode: string,
  room: Room,
  players: Player[],
  answers: RoundAnswer[],
) {
  const categories = room.currentCategories ?? [];
  const letter = room.currentLetter ?? "";
  const answerByUid = new Map(answers.map((answer) => [answer.uid, answer]));
  const answerPoints: Record<string, number[]> = {};
  const scores: Record<string, number> = {};

  categories.forEach((_, index) => {
    const normalizedCounts = new Map<string, number>();

    players.forEach((player) => {
      const normalized = normalizeAnswer(answerByUid.get(player.uid)?.values[index] ?? "");

      if (normalized && normalized.startsWith(letter.toLowerCase())) {
        normalizedCounts.set(normalized, (normalizedCounts.get(normalized) ?? 0) + 1);
      }
    });

    players.forEach((player) => {
      const normalized = normalizeAnswer(answerByUid.get(player.uid)?.values[index] ?? "");
      const valid = Boolean(normalized && normalized.startsWith(letter.toLowerCase()));
      const points = valid ? (normalizedCounts.get(normalized) === 1 ? 2 : 1) : 0;

      answerPoints[player.uid] = [...(answerPoints[player.uid] ?? []), points];
      scores[player.uid] = (scores[player.uid] ?? 0) + points;
    });
  });

  await updateDoc(roundRef(roomCode, room.currentRound), {
    answerPoints,
    endedAt: serverTimestamp(),
    scores,
  });

  await Promise.all(
    players.map((player) =>
      updateDoc(playerRef(roomCode, player.uid), {
        score: increment(scores[player.uid] ?? 0),
      }),
    ),
  );

  const isFinalRound = room.currentRound >= room.settings.totalRounds;

  await updateDoc(roomRef(roomCode), {
    lastActivityAt: serverTimestamp(),
    status: isFinalRound ? "finished" : "scoring",
  });
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
