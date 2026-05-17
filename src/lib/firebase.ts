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
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getCategoryPack, randomCategoryPool } from "../data/categories";

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

export type UserStats = {
  bestScore: number;
  gamesPlayed: number;
  totalPoints: number;
  wins: number;
};

export type UserProfile = {
  createdAt?: unknown;
  displayName: string;
  lastSeenAt?: unknown;
  photoURL: string | null;
  provider: "anonymous" | "google";
  stats: UserStats;
  uid: string;
};

export type RoomStatus = "lobby" | "playing" | "reviewing" | "scoring" | "finished";

export type RoomSettings = {
  categoriesPerRound: number;
  categorySource: "random" | "pack" | "custom";
  excludedLetters: string[];
  packId?: string;
  timerSeconds: number;
  totalRounds: number;
};

export type Room = {
  code: string;
  createdAt?: unknown;
  currentCategories?: string[];
  currentLetter?: string;
  currentRound: number;
  gameCategories?: string[];
  hostUid: string;
  lastActivityAt?: unknown;
  letterPickerOrder: string[];
  roundEndsAt?: Timestamp;
  settings: RoomSettings;
  status: RoomStatus;
  usedCategories?: string[];
};

export type Player = {
  avatar: string;
  connected: boolean;
  displayName: string;
  joinedAt?: unknown;
  lastSeenAt?: unknown;
  photoURL?: string | null;
  score: number;
  uid: string;
};

export type Round = {
  answerPoints?: Record<string, number[]>;
  categories: string[];
  endedAt?: unknown;
  letter: string;
  roundEndsAt?: Timestamp;
  scores?: Record<string, number>;
  startedAt?: unknown;
};

export type RoundAnswer = {
  submittedAt?: unknown;
  uid: string;
  values: Record<string, string>;
};

export type RoundVerdict = {
  categoryIndex: number;
  flags: string[];
  targetUid: string;
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

function getProvider(user: User): "anonymous" | "google" {
  return user.isAnonymous ? "anonymous" : "google";
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

function userProfileRef(uid: string) {
  return doc(db, "userProfiles", uid);
}

function userGameRef(uid: string, roomCode: string) {
  return doc(db, "userProfiles", uid, "games", roomCode.toUpperCase());
}

function verdictRef(roomCode: string, roundNumber: number, targetUid: string, categoryIndex: number) {
  return doc(
    db,
    "rooms",
    roomCode.toUpperCase(),
    "rounds",
    String(roundNumber),
    "verdicts",
    `${targetUid}_${categoryIndex}`,
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
      photoURL: user.photoURL ?? null,
      score: 0,
      uid: user.uid,
    } satisfies Player,
    { merge: true },
  );
}

export async function upsertUserProfile(user: User) {
  const profileSnapshot = await getDoc(userProfileRef(user.uid));
  const profileFields = {
    displayName: getDisplayName(user),
    lastSeenAt: serverTimestamp(),
    photoURL: user.photoURL ?? null,
    provider: getProvider(user),
    uid: user.uid,
  };

  await setDoc(
    userProfileRef(user.uid),
    profileSnapshot.exists()
      ? profileFields
      : ({
          ...profileFields,
          createdAt: serverTimestamp(),
          stats: {
            bestScore: 0,
            gamesPlayed: 0,
            totalPoints: 0,
            wins: 0,
          },
        } satisfies UserProfile),
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
        categoriesPerRound: 5,
        categorySource: "random",
        excludedLetters: ["Q", "X", "Z"],
        packId: "classic",
        timerSeconds: 120,
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

export function subscribeToUserProfile(
  uid: string,
  onChange: (profile: UserProfile | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    userProfileRef(uid),
    (snapshot) => {
      onChange(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
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

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function getCategorySource(settings: RoomSettings) {
  if (settings.categorySource === "pack") {
    return getCategoryPack(settings.packId).categories;
  }

  return randomCategoryPool.length > 0 ? randomCategoryPool : defaultRoundCategories;
}

function pickGameCategories(settings: RoomSettings) {
  const source = getCategorySource(settings);
  const categoriesPerRound = Math.min(settings.categoriesPerRound, source.length);

  return shuffle(source).slice(0, categoriesPerRound);
}

function getRoundCategories(room: Room) {
  if (room.gameCategories?.length) {
    return room.gameCategories;
  }

  return pickGameCategories(room.settings);
}

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
  const categories = getRoundCategories(room);
  const roundEndsAt = Timestamp.fromMillis(
    Date.now() + room.settings.timerSeconds * 1000,
  );

  await setDoc(roundRef(roomCode, roundNumber), {
    categories,
    letter,
    roundEndsAt,
    startedAt: serverTimestamp(),
  } satisfies Round);

  await updateDoc(roomRef(roomCode), {
    currentCategories: categories,
    currentLetter: letter,
    currentRound: roundNumber,
    gameCategories: categories,
    lastActivityAt: serverTimestamp(),
    roundEndsAt,
    status: "playing",
  });
}

export async function updateRoomSettings(
  roomCode: string,
  settings: Partial<RoomSettings>,
) {
  const updates = Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [`settings.${key}`, value]),
  );

  await updateDoc(roomRef(roomCode), {
    ...updates,
    gameCategories: [],
    lastActivityAt: serverTimestamp(),
    usedCategories: [],
  });
}

export async function beginRoundReview(roomCode: string, room: Room) {
  await updateDoc(roundRef(roomCode, room.currentRound), {
    endedAt: serverTimestamp(),
  });

  await updateDoc(roomRef(roomCode), {
    lastActivityAt: serverTimestamp(),
    status: "reviewing",
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

export function subscribeToRoundVerdicts(
  roomCode: string,
  roundNumber: number,
  onChange: (verdicts: RoundVerdict[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, "rooms", roomCode.toUpperCase(), "rounds", String(roundNumber), "verdicts"),
    (snapshot) => {
      onChange(snapshot.docs.map((verdictDoc) => verdictDoc.data() as RoundVerdict));
    },
    onError,
  );
}

export async function toggleAnswerFlag(
  roomCode: string,
  roundNumber: number,
  targetUid: string,
  categoryIndex: number,
  voterUid: string,
  currentlyFlagged: boolean,
) {
  await setDoc(
    verdictRef(roomCode, roundNumber, targetUid, categoryIndex),
    {
      categoryIndex,
      flags: currentlyFlagged ? arrayRemove(voterUid) : arrayUnion(voterUid),
      targetUid,
    },
    { merge: true },
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
  verdicts: RoundVerdict[] = [],
) {
  const categories = room.currentCategories ?? [];
  const letter = room.currentLetter ?? "";
  const answerByUid = new Map(answers.map((answer) => [answer.uid, answer]));
  const answerPoints: Record<string, number[]> = {};
  const scores: Record<string, number> = {};
  const verdictByAnswer = new Map(
    verdicts.map((verdict) => [`${verdict.targetUid}_${verdict.categoryIndex}`, verdict]),
  );

  function hasMajorityInvalidVote(player: Player, categoryIndex: number) {
    const voters = players.filter((voter) => voter.uid !== player.uid);
    const flags =
      verdictByAnswer
        .get(`${player.uid}_${categoryIndex}`)
        ?.flags.filter((uid) => uid !== player.uid) ?? [];

    return voters.length > 0 && flags.length > voters.length / 2;
  }

  categories.forEach((_, index) => {
    const normalizedCounts = new Map<string, number>();

    players.forEach((player) => {
      const normalized = normalizeAnswer(answerByUid.get(player.uid)?.values[index] ?? "");

      if (
        normalized &&
        normalized.startsWith(letter.toLowerCase()) &&
        !hasMajorityInvalidVote(player, index)
      ) {
        normalizedCounts.set(normalized, (normalizedCounts.get(normalized) ?? 0) + 1);
      }
    });

    players.forEach((player) => {
      const normalized = normalizeAnswer(answerByUid.get(player.uid)?.values[index] ?? "");
      const valid = Boolean(
        normalized &&
          normalized.startsWith(letter.toLowerCase()) &&
          !hasMajorityInvalidVote(player, index),
      );
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

export async function recordCompletedGame(
  roomCode: string,
  user: User,
  players: Player[],
) {
  const gameSnapshot = await getDoc(userGameRef(user.uid, roomCode));

  if (gameSnapshot.exists()) {
    return;
  }

  const freshPlayersSnapshot = await getDocs(
    collection(db, "rooms", roomCode.toUpperCase(), "players"),
  );
  const scorePlayers =
    freshPlayersSnapshot.docs.length > 0
      ? freshPlayersSnapshot.docs.map((playerDoc) => playerDoc.data() as Player)
      : players;
  const leaderboard = [...scorePlayers].sort((a, b) => b.score - a.score);
  const currentPlayer = leaderboard.find((player) => player.uid === user.uid);

  if (!currentPlayer) {
    return;
  }

  const bestScore = leaderboard[0]?.score ?? 0;
  const rank = leaderboard.findIndex((player) => player.uid === user.uid) + 1;
  const won = currentPlayer.score === bestScore;
  const profileSnapshot = await getDoc(userProfileRef(user.uid));
  const currentStats = profileSnapshot.exists()
    ? (profileSnapshot.data() as UserProfile).stats
    : null;

  await setDoc(userGameRef(user.uid, roomCode), {
    completedAt: serverTimestamp(),
    playerCount: scorePlayers.length,
    rank,
    roomCode: roomCode.toUpperCase(),
    score: currentPlayer.score,
    won,
  });

  await setDoc(
    userProfileRef(user.uid),
    {
      displayName: getDisplayName(user),
      lastSeenAt: serverTimestamp(),
      photoURL: user.photoURL ?? null,
      provider: getProvider(user),
      stats: {
        bestScore: Math.max(currentStats?.bestScore ?? 0, currentPlayer.score),
        gamesPlayed: increment(1),
        totalPoints: increment(currentPlayer.score),
        wins: increment(won ? 1 : 0),
      },
      uid: user.uid,
    },
    { merge: true },
  );
}

export async function writeConnectionCheck(user: User) {
  await setDoc(doc(db, "connectionChecks", user.uid), {
    displayName: user.displayName ?? "Guest player",
    lastCheckedAt: serverTimestamp(),
    provider: getProvider(user),
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
