import { type FormEvent, useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  LogOut,
  Plus,
  Play,
  Trophy,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  auth,
  createRoom,
  joinRoom,
  leaveRoom,
  revealRoundScores,
  signInAsGuest,
  signInWithGoogle,
  signOutCurrentUser,
  subscribeToConnectionCheck,
  subscribeToRoom,
  subscribeToRoomPlayers,
  subscribeToRound,
  subscribeToRoundAnswers,
  startSingleRound,
  submitRoundAnswers,
  type ConnectionCheck,
  type Player,
  type Room,
  type Round,
  type RoundAnswer,
  writeConnectionCheck,
} from "./lib/firebase";

const sampleCategories = [
  "Animal",
  "Things you find in a kitchen",
  "Famous landmarks",
  "Foods you eat with your hands",
  "Things that come in pairs",
];

function getFirebaseErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/unauthorized-domain") {
      return "Google sign-in is blocked because this site domain is not authorized in Firebase Authentication.";
    }

    if (error.code === "auth/popup-closed-by-user") {
      return "Google sign-in was closed before it finished.";
    }

    if (error.code === "auth/popup-blocked") {
      return "The browser blocked the Google sign-in popup.";
    }

    return `${error.code}: ${error.message}`;
  }

  return error instanceof Error ? error.message : "Something went wrong.";
}

function getInitialRoomCode() {
  return new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
}

function getRoomUrl(roomCode: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  return url.toString();
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheck | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState(
    "Sign in to create or join a room.",
  );
  const [isChecking, setIsChecking] = useState(false);
  const [isRoomBusy, setIsRoomBusy] = useState(false);
  const [joinCode, setJoinCode] = useState(getInitialRoomCode);
  const [activeRoomCode, setActiveRoomCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [roundAnswers, setRoundAnswers] = useState<RoundAnswer[]>([]);
  const [answerValues, setAnswerValues] = useState<Record<string, string>>({});
  const [isRoundBusy, setIsRoundBusy] = useState(false);

  const activeRoomUrl = useMemo(
    () => (activeRoomCode ? getRoomUrl(activeRoomCode) : ""),
    [activeRoomCode],
  );

  const connectedPlayers = players.filter((player) => player.connected);
  const isHost = Boolean(user && room?.hostUid === user.uid);
  const hostPlayer = players.find((player) => player.uid === room?.hostUid);
  const hostHasLeft = Boolean(room && hostPlayer && !hostPlayer.connected);
  const currentUserAnswer = roundAnswers.find((answer) => answer.uid === user?.uid);
  const submittedUids = new Set(roundAnswers.map((answer) => answer.uid));
  const allConnectedPlayersSubmitted =
    connectedPlayers.length > 0 &&
    connectedPlayers.every((player) => submittedUids.has(player.uid));

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setConnectionCheck(null);
      setStatusMessage(
        nextUser
          ? "Signed in. Create a room or join with a code."
          : "Sign in to create or join a room.",
      );
    });
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    return subscribeToConnectionCheck(
      user.uid,
      (check) => {
        setConnectionCheck(check);
        if (check) {
          setStatusMessage("Firestore listener received your latest check.");
        }
      },
      (error) => {
        setStatusMessage(error.message);
      },
    );
  }, [user]);

  useEffect(() => {
    if (!activeRoomCode) {
      setRoom(null);
      setPlayers([]);
      setRound(null);
      setRoundAnswers([]);
      return undefined;
    }

    const unsubscribeRoom = subscribeToRoom(
      activeRoomCode,
      (nextRoom) => {
        setRoom(nextRoom);
        if (!nextRoom) {
          setStatusMessage("That room no longer exists.");
        }
      },
      (error) => {
        setStatusMessage(error.message);
      },
    );

    const unsubscribePlayers = subscribeToRoomPlayers(
      activeRoomCode,
      (nextPlayers) => {
        setPlayers(nextPlayers);
      },
      (error) => {
        setStatusMessage(error.message);
      },
    );

    return () => {
      unsubscribeRoom();
      unsubscribePlayers();
    };
  }, [activeRoomCode]);

  useEffect(() => {
    if (!activeRoomCode || !room?.currentRound) {
      setRound(null);
      setRoundAnswers([]);
      return undefined;
    }

    const unsubscribeRound = subscribeToRound(
      activeRoomCode,
      room.currentRound,
      (nextRound) => {
        setRound(nextRound);
      },
      (error) => {
        setStatusMessage(error.message);
      },
    );

    const unsubscribeAnswers = subscribeToRoundAnswers(
      activeRoomCode,
      room.currentRound,
      (nextAnswers) => {
        setRoundAnswers(nextAnswers);
      },
      (error) => {
        setStatusMessage(error.message);
      },
    );

    return () => {
      unsubscribeRound();
      unsubscribeAnswers();
    };
  }, [activeRoomCode, room?.currentRound]);

  async function handleConnectionCheck() {
    if (!user) {
      return;
    }

    setIsChecking(true);
    setStatusMessage("Writing a test document to Firestore...");

    try {
      await writeConnectionCheck(user);
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsChecking(false);
    }
  }

  async function handleGuestSignIn() {
    setStatusMessage("Signing in as a guest...");

    try {
      await signInAsGuest();
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    }
  }

  async function handleGoogleSignIn() {
    setStatusMessage("Opening Google sign-in...");

    try {
      await signInWithGoogle();
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    }
  }

  async function handleCreateRoom() {
    if (!user) {
      setStatusMessage("Sign in first, then create a room.");
      return;
    }

    setIsRoomBusy(true);
    setStatusMessage("Creating a room...");

    try {
      const roomCode = await createRoom(user);
      setActiveRoomCode(roomCode);
      setJoinCode(roomCode);
      setAnswerValues({});
      window.history.replaceState(null, "", `?room=${roomCode}`);
      setStatusMessage(`Room ${roomCode} created. Share the code or link.`);
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsRoomBusy(false);
    }
  }

  async function handleJoinRoom(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!user) {
      setStatusMessage("Sign in first, then join a room.");
      return;
    }

    setIsRoomBusy(true);
    setStatusMessage("Joining room...");

    try {
      const roomCode = await joinRoom(joinCode, user);
      setActiveRoomCode(roomCode);
      setJoinCode(roomCode);
      window.history.replaceState(null, "", `?room=${roomCode}`);
      setStatusMessage(`Joined room ${roomCode}.`);
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsRoomBusy(false);
    }
  }

  async function handleLeaveRoom() {
    if (user && activeRoomCode) {
      await leaveRoom(activeRoomCode, user);
    }

    setActiveRoomCode("");
      setRoom(null);
      setPlayers([]);
      setRound(null);
      setRoundAnswers([]);
      setAnswerValues({});
    window.history.replaceState(null, "", window.location.pathname);
    setStatusMessage("You left the room.");
  }

  async function handleCopyRoomLink() {
    if (!activeRoomUrl) {
      setStatusMessage("Create or join a room before copying a link.");
      return;
    }

    await navigator.clipboard.writeText(activeRoomUrl);
    setStatusMessage("Room link copied.");
  }

  async function handleSignOut() {
    if (user && activeRoomCode) {
      await leaveRoom(activeRoomCode, user);
    }

    setActiveRoomCode("");
      setRoom(null);
      setPlayers([]);
      setRound(null);
      setRoundAnswers([]);
      setAnswerValues({});
      await signOutCurrentUser();
  }

  async function handleStartRound() {
    if (!room || !activeRoomCode || !isHost) {
      return;
    }

    setIsRoundBusy(true);
    setStatusMessage("Starting the first round...");

    try {
      await startSingleRound(activeRoomCode, room);
      setAnswerValues({});
      setStatusMessage("Round started. Everyone can answer now.");
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsRoundBusy(false);
    }
  }

  async function handleSubmitAnswers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !room || !activeRoomCode) {
      return;
    }

    setIsRoundBusy(true);
    setStatusMessage("Submitting your answers...");

    try {
      await submitRoundAnswers(activeRoomCode, room.currentRound, user, answerValues);
      setStatusMessage("Answers submitted. Waiting for the room.");
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsRoundBusy(false);
    }
  }

  async function handleRevealScores() {
    if (!room || !activeRoomCode || !isHost) {
      return;
    }

    setIsRoundBusy(true);
    setStatusMessage("Revealing scores...");

    try {
      await revealRoundScores(activeRoomCode, room, connectedPlayers, roundAnswers);
      setStatusMessage("Scores revealed.");
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsRoundBusy(false);
    }
  }

  const roundCategories = room?.currentCategories ?? round?.categories ?? [];

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
              Live word game
            </p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">Categories</h1>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded border border-line bg-white">
            <UsersRound aria-hidden="true" className="h-5 w-5" />
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1fr_390px]">
          <section className="max-w-2xl">
            <div className="mb-6 inline-flex items-center rounded border border-line bg-white px-3 py-2 text-sm font-semibold text-muted">
              Letter for this round
              <span className="ml-3 flex h-9 w-9 items-center justify-center rounded bg-warning text-xl font-black text-ink">
                C
              </span>
            </div>

            <h2 className="text-5xl font-black leading-none sm:text-7xl">
              Race the room.
              <span className="block text-focus">Match the letter.</span>
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
              Create a room, share the code, and play realtime category rounds
              with family and friends. Firebase keeps everyone in sync without a
              server to manage.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex h-12 items-center justify-center rounded border border-ink bg-ink px-5 text-base font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRoomBusy}
                onClick={() => void handleCreateRoom()}
                type="button"
              >
                <Plus aria-hidden="true" className="mr-2 h-5 w-5" />
                Create Room
              </button>
              <form className="flex gap-2" onSubmit={(event) => void handleJoinRoom(event)}>
                <input
                  aria-label="Room code"
                  className="h-12 w-32 rounded border border-line bg-white px-3 text-center text-base font-black uppercase tracking-[0.16em] outline-none transition focus:border-focus"
                  maxLength={6}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  placeholder="CODE"
                  value={joinCode}
                />
                <button
                  className="inline-flex h-12 items-center justify-center rounded border border-line bg-white px-4 text-base font-bold transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isRoomBusy}
                  type="submit"
                >
                  Join
                  <ArrowRight aria-hidden="true" className="ml-2 h-5 w-5" />
                </button>
              </form>
            </div>
          </section>

          <aside className="rounded-lg border border-line bg-white p-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <p className="text-sm font-semibold text-muted">Room code</p>
                <p className="text-3xl font-black tracking-[0.16em]">
                  {activeRoomCode || "----"}
                </p>
              </div>
              <button
                aria-label="Copy room link"
                className="flex h-10 w-10 items-center justify-center rounded border border-line transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!activeRoomCode}
                onClick={() => void handleCopyRoomLink()}
                type="button"
              >
                <Copy aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            {activeRoomCode ? (
              <div className="mt-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-muted">
                    {connectedPlayers.length} player
                    {connectedPlayers.length === 1 ? "" : "s"} in room
                  </p>
                  {isHost ? (
                    <span className="rounded border border-line bg-paper px-2 py-1 text-xs font-black">
                      Host
                    </span>
                  ) : null}
                </div>

                {hostHasLeft ? (
                  <div className="mb-3 rounded border border-warning bg-paper px-3 py-2 text-sm font-bold">
                    Host left. Create a new room to start another game.
                  </div>
                ) : null}

                <div className="space-y-3">
                  {players.map((player) => (
                    <div
                      className="flex min-h-12 items-center justify-between rounded border border-line px-3"
                      key={player.uid}
                    >
                      <div className="flex min-w-0 items-center">
                        <span className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-paper text-sm font-black">
                          {player.avatar}
                        </span>
                        <span className="truncate text-sm font-semibold">
                          {player.displayName}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-muted">
                        {player.connected ? "Online" : "Away"}
                      </span>
                    </div>
                  ))}
                </div>

                {room?.status === "lobby" ? (
                  <button
                    className="mt-4 inline-flex h-11 w-full items-center justify-center rounded border border-ink bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!isHost || hostHasLeft || isRoundBusy}
                    onClick={() => void handleStartRound()}
                    type="button"
                  >
                    <Play aria-hidden="true" className="mr-2 h-4 w-4" />
                    Start Round
                  </button>
                ) : null}

                {room?.status === "playing" && isHost ? (
                  <button
                    className="mt-4 inline-flex h-11 w-full items-center justify-center rounded border border-ink bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!allConnectedPlayersSubmitted || isRoundBusy}
                    onClick={() => void handleRevealScores()}
                    type="button"
                  >
                    <Trophy aria-hidden="true" className="mr-2 h-4 w-4" />
                    Reveal Scores
                  </button>
                ) : null}

                <button
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded border border-line bg-white px-4 text-sm font-bold transition hover:border-ink"
                  onClick={() => void handleLeaveRoom()}
                  type="button"
                >
                  Leave Room
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {sampleCategories.map((category, index) => (
                  <div
                    className="flex min-h-12 items-center rounded border border-line px-3"
                    key={category}
                  >
                    <span className="mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-paper text-sm font-black">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold">{category}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>

        {activeRoomCode && room?.status === "playing" ? (
          <section className="mb-6 rounded-lg border border-line bg-white p-4">
            <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-muted">Round {room.currentRound}</p>
                <h2 className="text-2xl font-black">
                  Answers starting with {room.currentLetter}
                </h2>
              </div>
              <p className="text-sm font-bold text-muted">
                {roundAnswers.length}/{connectedPlayers.length} submitted
              </p>
            </div>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmitAnswers(event)}>
              {roundCategories.map((category, index) => (
                <label
                  className="grid gap-2 rounded border border-line p-3 sm:grid-cols-[220px_1fr] sm:items-center"
                  key={category}
                >
                  <span className="text-sm font-bold">{category}</span>
                  <input
                    className="h-11 rounded border border-line px-3 text-base font-semibold outline-none transition focus:border-focus disabled:bg-paper"
                    disabled={Boolean(currentUserAnswer)}
                    onChange={(event) =>
                      setAnswerValues((currentValues) => ({
                        ...currentValues,
                        [index]: event.target.value,
                      }))
                    }
                    placeholder={`${room.currentLetter}...`}
                    value={answerValues[index] ?? currentUserAnswer?.values[index] ?? ""}
                  />
                </label>
              ))}

              <button
                className="inline-flex h-11 w-full items-center justify-center rounded border border-ink bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                disabled={Boolean(currentUserAnswer) || isRoundBusy}
                type="submit"
              >
                {currentUserAnswer ? "Submitted" : "Submit Answers"}
              </button>
            </form>
          </section>
        ) : null}

        {activeRoomCode && room?.status === "scoring" && round ? (
          <section className="mb-6 rounded-lg border border-line bg-white p-4">
            <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-muted">Round {room.currentRound}</p>
                <h2 className="text-2xl font-black">Scores</h2>
              </div>
              <p className="text-sm font-bold text-muted">Letter {round.letter}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {connectedPlayers.map((player) => (
                <div
                  className="rounded border border-line p-3"
                  key={player.uid}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black">{player.displayName}</span>
                    <span className="text-2xl font-black">
                      {round.scores?.[player.uid] ?? 0}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {roundCategories.map((category, index) => {
                      const answer = roundAnswers.find(
                        (roundAnswer) => roundAnswer.uid === player.uid,
                      )?.values[index];

                      return (
                        <div className="flex justify-between gap-3 text-sm" key={category}>
                          <span className="truncate text-muted">
                            {category}: {answer || "-"}
                          </span>
                          <span className="font-black">
                            {round.answerPoints?.[player.uid]?.[index] ?? 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mb-6 rounded-lg border border-line bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-muted">Firebase setup</p>
              <h2 className="mt-1 text-xl font-black">
                {user
                  ? `Signed in as ${user.displayName ?? "Guest player"}`
                  : authReady
                    ? "Ready to sign in"
                    : "Checking sign-in state..."}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                {statusMessage}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {!user ? (
                <>
                  <button
                    className="inline-flex h-11 items-center justify-center rounded border border-ink bg-ink px-4 text-sm font-bold text-white transition hover:bg-black"
                    onClick={() => void handleGuestSignIn()}
                    type="button"
                  >
                    <UserPlus aria-hidden="true" className="mr-2 h-4 w-4" />
                    Continue as Guest
                  </button>
                  <button
                    className="inline-flex h-11 items-center justify-center rounded border border-line bg-white px-4 text-sm font-bold transition hover:border-ink"
                    onClick={() => void handleGoogleSignIn()}
                    type="button"
                  >
                    Sign in with Google
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="inline-flex h-11 items-center justify-center rounded border border-ink bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isChecking}
                    onClick={() => void handleConnectionCheck()}
                    type="button"
                  >
                    {connectionCheck ? (
                      <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" />
                    ) : null}
                    {isChecking ? "Checking..." : "Run Firestore Check"}
                  </button>
                  <button
                    aria-label="Sign out"
                    className="inline-flex h-11 items-center justify-center rounded border border-line bg-white px-4 text-sm font-bold transition hover:border-ink"
                    onClick={() => void handleSignOut()}
                    type="button"
                  >
                    <LogOut aria-hidden="true" className="mr-2 h-4 w-4" />
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
