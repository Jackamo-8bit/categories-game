import { type FormEvent, useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, type User } from "firebase/auth";
import QRCode from "qrcode";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Flag,
  LogOut,
  Plus,
  Play,
  QrCode,
  Share2,
  Trophy,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  auth,
  beginRoundReview,
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
  subscribeToRoundVerdicts,
  startNextRound,
  submitRoundAnswers,
  toggleAnswerFlag,
  updateRoomSettings,
  type ConnectionCheck,
  type Player,
  type Room,
  type Round,
  type RoundAnswer,
  type RoundVerdict,
  writeConnectionCheck,
} from "./lib/firebase";
import { categoryPacks } from "./data/categories";

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

function getTimestampMillis(timestamp: unknown) {
  if (!timestamp) {
    return null;
  }

  if (
    typeof timestamp === "object" &&
    "toMillis" in timestamp &&
    typeof timestamp.toMillis === "function"
  ) {
    return timestamp.toMillis();
  }

  if (
    typeof timestamp === "object" &&
    "seconds" in timestamp &&
    typeof timestamp.seconds === "number"
  ) {
    return timestamp.seconds * 1000;
  }

  return null;
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function normalizeAnswer(answer: string) {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

function LetterlyMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded border border-ink bg-paper font-black text-ink ${className}`}
    >
      L
      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-coral" />
      <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-focus" />
    </span>
  );
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
  const [roundVerdicts, setRoundVerdicts] = useState<RoundVerdict[]>([]);
  const [answerValues, setAnswerValues] = useState<Record<string, string>>({});
  const [isRoundBusy, setIsRoundBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [autoSubmittedRound, setAutoSubmittedRound] = useState(0);
  const [roomQrDataUrl, setRoomQrDataUrl] = useState("");

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
  const roundEndsAtMs = getTimestampMillis(round?.roundEndsAt ?? room?.roundEndsAt);
  const secondsLeft =
    room?.status === "playing" && roundEndsAtMs
      ? Math.max(0, Math.ceil((roundEndsAtMs - nowMs) / 1000))
      : null;
  const timerExpired = room?.status === "playing" && secondsLeft === 0;
  const canMoveToReview = allConnectedPlayersSubmitted || timerExpired;
  const leaderboard = [...players].sort((a, b) => b.score - a.score);
  const winner = leaderboard[0];

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
      setRoundVerdicts([]);
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
      setRoundVerdicts([]);
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

    const unsubscribeVerdicts = subscribeToRoundVerdicts(
      activeRoomCode,
      room.currentRound,
      (nextVerdicts) => {
        setRoundVerdicts(nextVerdicts);
      },
      (error) => {
        setStatusMessage(error.message);
      },
    );

    return () => {
      unsubscribeRound();
      unsubscribeAnswers();
      unsubscribeVerdicts();
    };
  }, [activeRoomCode, room?.currentRound]);

  useEffect(() => {
    setAnswerValues({});
    setAutoSubmittedRound(0);
  }, [room?.currentRound]);

  useEffect(() => {
    if (!activeRoomUrl) {
      setRoomQrDataUrl("");
      return;
    }

    let isCurrent = true;

    void QRCode.toDataURL(activeRoomUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 132,
    }).then((dataUrl) => {
      if (isCurrent) {
        setRoomQrDataUrl(dataUrl);
      }
    }).catch(() => {
      if (isCurrent) {
        setRoomQrDataUrl("");
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [activeRoomUrl]);

  useEffect(() => {
    if (room?.status !== "playing") {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [room?.status]);

  useEffect(() => {
    if (
      !timerExpired ||
      !user ||
      !room ||
      !activeRoomCode ||
      currentUserAnswer ||
      autoSubmittedRound === room.currentRound
    ) {
      return;
    }

    setAutoSubmittedRound(room.currentRound);
    void submitRoundAnswers(activeRoomCode, room.currentRound, user, answerValues)
      .then(() => {
        setStatusMessage("Time is up. Your answers were submitted.");
      })
      .catch((error) => {
        setStatusMessage(getFirebaseErrorMessage(error));
      });
  }, [
    activeRoomCode,
    answerValues,
    autoSubmittedRound,
    currentUserAnswer,
    room,
    timerExpired,
    user,
  ]);

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
    setRoundVerdicts([]);
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

  async function handleShareRoomLink() {
    if (!activeRoomUrl) {
      setStatusMessage("Create or join a room before sharing a link.");
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          text: "Join my Letterly room.",
          title: "Letterly room",
          url: activeRoomUrl,
        });
        setStatusMessage("Room link shared.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
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
    setRoundVerdicts([]);
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
      await startNextRound(activeRoomCode, room);
      setAnswerValues({});
      setStatusMessage("Round started. Everyone can answer now.");
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsRoundBusy(false);
    }
  }

  async function handleSettingChange(settings: Parameters<typeof updateRoomSettings>[1]) {
    if (!activeRoomCode || !isHost || room?.status !== "lobby") {
      return;
    }

    setStatusMessage("Updating room settings...");

    try {
      await updateRoomSettings(activeRoomCode, settings);
      setStatusMessage("Room settings updated.");
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
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

  async function handleBeginReview() {
    if (!room || !activeRoomCode || !isHost) {
      return;
    }

    setIsRoundBusy(true);
    setStatusMessage("Opening the answer review...");

    try {
      await beginRoundReview(activeRoomCode, room);
      setStatusMessage("Review the answers, then reveal scores.");
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsRoundBusy(false);
    }
  }

  async function handleToggleFlag(targetUid: string, categoryIndex: number) {
    if (!user || !room || !activeRoomCode || user.uid === targetUid) {
      return;
    }

    const verdict = roundVerdicts.find(
      (roundVerdict) =>
        roundVerdict.targetUid === targetUid &&
        roundVerdict.categoryIndex === categoryIndex,
    );
    const currentlyFlagged = Boolean(verdict?.flags.includes(user.uid));

    try {
      await toggleAnswerFlag(
        activeRoomCode,
        room.currentRound,
        targetUid,
        categoryIndex,
        user.uid,
        currentlyFlagged,
      );
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    }
  }

  async function handleRevealScores() {
    if (!room || !activeRoomCode || !isHost) {
      return;
    }

    setIsRoundBusy(true);
    setStatusMessage("Revealing scores...");

    try {
      await revealRoundScores(
        activeRoomCode,
        room,
        connectedPlayers,
        roundAnswers,
        roundVerdicts,
      );
      setStatusMessage("Scores revealed.");
    } catch (error) {
      setStatusMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsRoundBusy(false);
    }
  }

  const roundCategories = room?.currentCategories ?? round?.categories ?? [];
  const currentLetter = (room?.currentLetter ?? round?.letter ?? "").toLowerCase();
  const timerLabel = secondsLeft === null ? "--:--" : formatTimer(secondsLeft);

  function getPlayerAnswer(playerUid: string, categoryIndex: number) {
    return roundAnswers.find((answer) => answer.uid === playerUid)?.values[categoryIndex] ?? "";
  }

  function getVerdict(targetUid: string, categoryIndex: number) {
    return roundVerdicts.find(
      (verdict) =>
        verdict.targetUid === targetUid && verdict.categoryIndex === categoryIndex,
    );
  }

  function getFlagCount(targetUid: string, categoryIndex: number) {
    return (
      getVerdict(targetUid, categoryIndex)?.flags.filter((uid) => uid !== targetUid)
        .length ?? 0
    );
  }

  function isAnswerAutoInvalid(answer: string) {
    const normalized = normalizeAnswer(answer);

    return !normalized || !normalized.startsWith(currentLetter);
  }

  function isAnswerVotedInvalid(targetUid: string, categoryIndex: number) {
    const voters = connectedPlayers.filter((player) => player.uid !== targetUid);

    return voters.length > 0 && getFlagCount(targetUid, categoryIndex) > voters.length / 2;
  }

  if (activeRoomCode && room?.status === "playing") {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
          <header className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                Room {activeRoomCode}
              </p>
              <div className="mt-1 flex items-center gap-3">
                <LetterlyMark className="h-11 w-11 text-xl" />
                <h1 className="text-3xl font-black sm:text-4xl">
                  Round {room.currentRound}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-14 items-center rounded border border-line bg-white px-4 text-xl font-black">
                <Clock aria-hidden="true" className="mr-2 h-5 w-5" />
                {timerLabel}
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded border border-line bg-warning text-3xl font-black">
                {room.currentLetter}
              </div>
            </div>
          </header>

          <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[1fr_320px]">
            <section className="rounded-lg border border-line bg-white p-4">
              <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted">
                    Answers starting with
                  </p>
                  <h2 className="text-4xl font-black">{room.currentLetter}</h2>
                </div>
                <p className="text-sm font-bold text-muted">
                  {roundAnswers.length}/{connectedPlayers.length} submitted
                </p>
              </div>

              {currentUserAnswer ? (
                <div className="mt-4 rounded border border-success bg-paper px-4 py-3 text-sm font-bold">
                  Answers submitted. Waiting for the rest of the room.
                </div>
              ) : null}
              {timerExpired && !currentUserAnswer ? (
                <div className="mt-4 rounded border border-warning bg-paper px-4 py-3 text-sm font-bold">
                  Time is up. Submitting anything you have entered.
                </div>
              ) : null}

              <form
                className="mt-4 space-y-3"
                onSubmit={(event) => void handleSubmitAnswers(event)}
              >
                {roundCategories.map((category, index) => (
                  <label
                    className="grid gap-2 rounded border border-line p-3 sm:grid-cols-[220px_1fr] sm:items-center"
                    key={category}
                  >
                    <span className="text-sm font-bold">{category}</span>
                    <input
                      className="h-11 rounded border border-line px-3 text-base font-semibold outline-none transition focus:border-focus disabled:bg-paper"
                      disabled={Boolean(currentUserAnswer) || timerExpired}
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
                  className="inline-flex h-12 w-full items-center justify-center rounded border border-ink bg-ink px-4 text-base font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  disabled={Boolean(currentUserAnswer) || timerExpired || isRoundBusy}
                  type="submit"
                >
                  {currentUserAnswer ? "Submitted" : "Submit Answers"}
                </button>
              </form>
            </section>

            <aside className="rounded-lg border border-line bg-white p-4">
              <div className="border-b border-line pb-3">
                <p className="text-sm font-semibold text-muted">Players</p>
                <p className="text-lg font-black">
                  {roundAnswers.length}/{connectedPlayers.length} submitted
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {connectedPlayers.map((player) => (
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
                      {submittedUids.has(player.uid) ? "Done" : "Answering"}
                    </span>
                  </div>
                ))}
              </div>

              {isHost ? (
                <button
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded border border-ink bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canMoveToReview || isRoundBusy}
                  onClick={() => void handleBeginReview()}
                  type="button"
                >
                  <Flag aria-hidden="true" className="mr-2 h-4 w-4" />
                  Review Answers
                </button>
              ) : (
                <p className="mt-4 rounded border border-line bg-paper px-3 py-2 text-sm font-bold text-muted">
                  Waiting for the host to open review.
                </p>
              )}

              <button
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded border border-line bg-white px-4 text-sm font-bold transition hover:border-ink"
                onClick={() => void handleLeaveRoom()}
                type="button"
              >
                Leave Room
              </button>
            </aside>
          </div>
        </section>
      </main>
    );
  }

  if (activeRoomCode && room?.status === "reviewing" && round) {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
          <header className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                Room {activeRoomCode}
              </p>
              <div className="mt-1 flex items-center gap-3">
                <LetterlyMark className="h-11 w-11 text-xl" />
                <h1 className="text-3xl font-black sm:text-4xl">
                  Review Round {room.currentRound}
                </h1>
              </div>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded border border-line bg-warning text-3xl font-black">
              {round.letter}
            </div>
          </header>

          <section className="py-6">
            <div className="mb-4 rounded-lg border border-line bg-white p-4">
              <p className="text-sm font-semibold text-muted">Voting</p>
              <p className="mt-1 text-sm font-bold text-muted">
                Flag answers that should not score. A majority of the other players
                marks an answer as invalid.
              </p>
            </div>

            <div className="space-y-4">
              {roundCategories.map((category, categoryIndex) => (
                <section
                  className="rounded-lg border border-line bg-white p-4"
                  key={category}
                >
                  <h2 className="text-lg font-black">{category}</h2>
                  <div className="mt-3 space-y-3">
                    {connectedPlayers.map((player) => {
                      const answer = getPlayerAnswer(player.uid, categoryIndex);
                      const autoInvalid = isAnswerAutoInvalid(answer);
                      const votedInvalid = isAnswerVotedInvalid(player.uid, categoryIndex);
                      const flags = getFlagCount(player.uid, categoryIndex);
                      const currentUserFlagged = Boolean(
                        user &&
                          getVerdict(player.uid, categoryIndex)?.flags.includes(user.uid),
                      );
                      const canFlag = Boolean(user && user.uid !== player.uid && !autoInvalid);

                      return (
                        <div
                          className="grid gap-3 rounded border border-line p-3 sm:grid-cols-[180px_1fr_auto] sm:items-center"
                          key={player.uid}
                        >
                          <span className="font-bold">{player.displayName}</span>
                          <div>
                            <p className="text-base font-black">{answer || "-"}</p>
                            <p className="mt-1 text-xs font-bold text-muted">
                              {autoInvalid
                                ? "No score: blank or wrong letter"
                                : votedInvalid
                                  ? `${flags} flag${flags === 1 ? "" : "s"}: no score`
                                  : `${flags} flag${flags === 1 ? "" : "s"}`}
                            </p>
                          </div>
                          <button
                            className="inline-flex h-10 items-center justify-center rounded border border-line bg-white px-3 text-sm font-bold transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!canFlag}
                            onClick={() =>
                              void handleToggleFlag(player.uid, categoryIndex)
                            }
                            type="button"
                          >
                            <Flag
                              aria-hidden="true"
                              className={`mr-2 h-4 w-4 ${
                                currentUserFlagged ? "fill-ink" : ""
                              }`}
                            />
                            {currentUserFlagged ? "Flagged" : "Flag"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex h-11 items-center justify-center rounded border border-line bg-white px-4 text-sm font-bold transition hover:border-ink"
                onClick={() => void handleLeaveRoom()}
                type="button"
              >
                Leave Room
              </button>
              {isHost ? (
                <button
                  className="inline-flex h-11 items-center justify-center rounded border border-ink bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isRoundBusy}
                  onClick={() => void handleRevealScores()}
                  type="button"
                >
                  <Trophy aria-hidden="true" className="mr-2 h-4 w-4" />
                  Reveal Scores
                </button>
              ) : (
                <p className="text-sm font-bold text-muted">
                  Waiting for the host to reveal scores.
                </p>
              )}
            </div>
          </section>
        </section>
      </main>
    );
  }

  if (activeRoomCode && room?.status === "scoring" && round) {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
          <header className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                Room {activeRoomCode}
              </p>
              <div className="mt-1 flex items-center gap-3">
                <LetterlyMark className="h-11 w-11 text-xl" />
                <h1 className="text-3xl font-black sm:text-4xl">
                  Round {room.currentRound} Scores
                </h1>
              </div>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded border border-line bg-warning text-3xl font-black">
              {round.letter}
            </div>
          </header>

          <section className="py-6">
            <div className="mb-4 rounded-lg border border-line bg-white p-4">
              <p className="text-sm font-semibold text-muted">Leaderboard</p>
              <div className="mt-3 space-y-2">
                {leaderboard.map((player, index) => (
                  <div className="flex items-center justify-between" key={player.uid}>
                    <span className="font-bold">
                      {index + 1}. {player.displayName}
                    </span>
                    <span className="font-black">{player.score}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {connectedPlayers.map((player) => (
                <div className="rounded-lg border border-line bg-white p-4" key={player.uid}>
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <span className="font-black">{player.displayName}</span>
                    <span className="text-3xl font-black">
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

            <button
              className="mt-4 mr-3 inline-flex h-11 items-center justify-center rounded border border-line bg-white px-4 text-sm font-bold transition hover:border-ink"
              onClick={() => void handleLeaveRoom()}
              type="button"
            >
              Leave Room
            </button>
            {isHost ? (
              <button
                className="mt-4 inline-flex h-11 items-center justify-center rounded border border-ink bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRoundBusy}
                onClick={() => void handleStartRound()}
                type="button"
              >
                Next Round
              </button>
            ) : (
              <p className="mt-4 inline-block text-sm font-bold text-muted">
                Waiting for the host to start the next round.
              </p>
            )}
          </section>
        </section>
      </main>
    );
  }

  if (activeRoomCode && room?.status === "finished") {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-6 sm:px-8">
          <header className="border-b border-line pb-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
              Room {activeRoomCode}
            </p>
            <div className="mt-1 flex items-center gap-3">
              <LetterlyMark className="h-12 w-12 text-2xl" />
              <h1 className="text-4xl font-black sm:text-5xl">Final Scores</h1>
            </div>
          </header>

          <section className="py-6">
            {winner ? (
              <div className="rounded-lg border border-line bg-white p-5">
                <p className="text-sm font-semibold text-muted">Winner</p>
                <h2 className="mt-1 text-4xl font-black">{winner.displayName}</h2>
                <p className="mt-2 text-lg font-bold text-muted">
                  {winner.score} total points
                </p>
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-line bg-white p-4">
              <p className="text-sm font-semibold text-muted">Leaderboard</p>
              <div className="mt-3 space-y-3">
                {leaderboard.map((player, index) => (
                  <div
                    className="flex min-h-12 items-center justify-between rounded border border-line px-3"
                    key={player.uid}
                  >
                    <span className="font-bold">
                      {index + 1}. {player.displayName}
                    </span>
                    <span className="text-xl font-black">{player.score}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              className="mt-4 inline-flex h-11 items-center justify-center rounded border border-line bg-white px-4 text-sm font-bold transition hover:border-ink"
              onClick={() => void handleLeaveRoom()}
              type="button"
            >
              Leave Room
            </button>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <LetterlyMark />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                Live word game
              </p>
              <h1 className="mt-1 text-3xl font-black sm:text-4xl">Letterly</h1>
            </div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded border border-line bg-white">
            <UsersRound aria-hidden="true" className="h-5 w-5" />
          </div>
        </header>

        <div
          className={`grid flex-1 gap-10 py-8 lg:grid-cols-[1fr_390px] ${
            activeRoomCode ? "items-start" : "items-center"
          }`}
        >
          <section className="max-w-2xl">
            <h2 className="text-5xl font-black leading-none sm:text-7xl">
              Race the room.
              <span className="block text-focus">Match the letter.</span>
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
              Create a room, share the code, and play realtime category rounds
              with family and friends. Firebase keeps everyone in sync without a
              server to manage.
            </p>

            {activeRoomCode ? (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <section className="rounded-lg border border-line bg-white p-4">
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
                </section>

                {players.length > 0 ? (
                  <section className="rounded-lg border border-line bg-white p-4">
                    <p className="text-sm font-semibold text-muted">Leaderboard</p>
                    <div className="mt-3 space-y-2">
                      {leaderboard.map((player, index) => (
                        <div className="flex justify-between text-sm" key={player.uid}>
                          <span className="font-bold">
                            {index + 1}. {player.displayName}
                          </span>
                          <span className="font-black">{player.score}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </section>

          <aside className="rounded-lg border border-line bg-white p-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <p className="text-sm font-semibold text-muted">Room code</p>
                <p className="text-3xl font-black tracking-[0.16em]">
                  {activeRoomCode || "----"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  aria-label="Copy room link"
                  className="flex h-10 w-10 items-center justify-center rounded border border-line transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!activeRoomCode}
                  onClick={() => void handleCopyRoomLink()}
                  type="button"
                >
                  <Copy aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  aria-label="Share room link"
                  className="flex h-10 w-10 items-center justify-center rounded border border-line transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!activeRoomCode}
                  onClick={() => void handleShareRoomLink()}
                  type="button"
                >
                  <Share2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {activeRoomCode ? (
              <div className="mt-4">
                {roomQrDataUrl ? (
                  <div className="mb-4 flex items-center gap-3 rounded border border-line bg-paper p-3">
                    <img
                      alt={`QR code for room ${activeRoomCode}`}
                      className="h-20 w-20 rounded border border-line bg-white"
                      src={roomQrDataUrl}
                    />
                    <div>
                      <p className="flex items-center text-sm font-black">
                        <QrCode aria-hidden="true" className="mr-2 h-4 w-4" />
                        Scan to join
                      </p>
                    </div>
                  </div>
                ) : null}

                {room?.status === "lobby" && isHost ? (
                  <div className="rounded border border-line bg-white p-3">
                    <p className="text-sm font-semibold text-muted">Categories</p>
                    <div className="mt-3 grid gap-3">
                      <label className="grid gap-1 text-sm font-bold">
                        Source
                        <select
                          className="h-10 rounded border border-line bg-white px-2 font-semibold outline-none focus:border-focus"
                          onChange={(event) =>
                            void handleSettingChange({
                              categorySource: event.target.value as "random" | "pack",
                            })
                          }
                          value={room.settings.categorySource}
                        >
                          <option value="random">Random pool</option>
                          <option value="pack">Preset pack</option>
                        </select>
                      </label>

                      {room.settings.categorySource === "pack" ? (
                        <label className="grid gap-1 text-sm font-bold">
                          Pack
                          <select
                            className="h-10 rounded border border-line bg-white px-2 font-semibold outline-none focus:border-focus"
                            onChange={(event) =>
                              void handleSettingChange({ packId: event.target.value })
                            }
                            value={room.settings.packId ?? "classic"}
                          >
                            {categoryPacks.map((pack) => (
                              <option key={pack.id} value={pack.id}>
                                {pack.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      <label className="grid gap-1 text-sm font-bold">
                        Rounds
                        <select
                          className="h-10 rounded border border-line bg-white px-2 font-semibold outline-none focus:border-focus"
                          onChange={(event) =>
                            void handleSettingChange({
                              totalRounds: Number(event.target.value),
                            })
                          }
                          value={room.settings.totalRounds}
                        >
                          <option value={3}>3 rounds</option>
                          <option value={5}>5 rounds</option>
                          <option value={10}>10 rounds</option>
                        </select>
                      </label>

                      <label className="grid gap-1 text-sm font-bold">
                        Categories per round
                        <select
                          className="h-10 rounded border border-line bg-white px-2 font-semibold outline-none focus:border-focus"
                          onChange={(event) =>
                            void handleSettingChange({
                              categoriesPerRound: Number(event.target.value),
                            })
                          }
                          value={room.settings.categoriesPerRound}
                        >
                          <option value={5}>5</option>
                          <option value={8}>8</option>
                          <option value={10}>10</option>
                        </select>
                      </label>

                      <label className="grid gap-1 text-sm font-bold">
                        Round timer
                        <select
                          className="h-10 rounded border border-line bg-white px-2 font-semibold outline-none focus:border-focus"
                          onChange={(event) =>
                            void handleSettingChange({
                              timerSeconds: Number(event.target.value),
                            })
                          }
                          value={room.settings.timerSeconds}
                        >
                          <option value={60}>1 minute</option>
                          <option value={90}>1 minute 30</option>
                          <option value={120}>2 minutes</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ) : activeRoomCode && room?.status === "lobby" ? (
                  <div className="mt-4 rounded border border-line bg-paper p-3">
                    <p className="text-sm font-semibold text-muted">Categories</p>
                    <p className="mt-1 text-sm font-bold">
                      {room.settings.categorySource === "pack"
                        ? categoryPacks.find((pack) => pack.id === room.settings.packId)
                            ?.name ?? "Classic"
                        : "Random pool"}{" "}
                      · {room.settings.totalRounds} rounds ·{" "}
                      {room.settings.categoriesPerRound} categories ·{" "}
                      {room.settings.timerSeconds / 60} min rounds
                    </p>
                  </div>
                ) : null}

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
              <div className="mt-4">
                <p className="text-sm font-semibold text-muted">Start</p>
                <button
                  className="mt-3 inline-flex h-12 w-full items-center justify-center rounded border border-ink bg-ink px-5 text-base font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isRoomBusy || !user}
                  onClick={() => void handleCreateRoom()}
                  type="button"
                >
                  <Plus aria-hidden="true" className="mr-2 h-5 w-5" />
                  Create Room
                </button>

                <div className="my-4 border-t border-line" />

                <p className="text-sm font-semibold text-muted">Join</p>
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                  onSubmit={(event) => void handleJoinRoom(event)}
                >
                  <input
                    aria-label="Room code"
                    className="h-12 rounded border border-line bg-white px-3 text-center text-base font-black uppercase tracking-[0.16em] outline-none transition focus:border-focus"
                    maxLength={6}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="CODE"
                    value={joinCode}
                  />
                  <button
                    className="inline-flex h-12 items-center justify-center rounded border border-line bg-white px-4 text-base font-bold transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isRoomBusy || !user}
                    type="submit"
                  >
                    Join
                    <ArrowRight aria-hidden="true" className="ml-2 h-5 w-5" />
                  </button>
                </form>

                {!user ? (
                  <p className="mt-4 rounded border border-line bg-paper px-3 py-2 text-sm font-bold text-muted">
                    Sign in as a guest or with Google to play.
                  </p>
                ) : null}
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
