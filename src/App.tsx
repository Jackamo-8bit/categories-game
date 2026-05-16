import { useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ArrowRight, CheckCircle2, Copy, LogOut, UsersRound } from "lucide-react";
import {
  auth,
  signInAsGuest,
  signInWithGoogle,
  signOutCurrentUser,
  subscribeToConnectionCheck,
  type ConnectionCheck,
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

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheck | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState(
    "Sign in to run a Firebase connection check.",
  );
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setConnectionCheck(null);
      setStatusMessage(
        nextUser
          ? "Signed in. Run the Firestore check when you are ready."
          : "Sign in to run a Firebase connection check.",
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

  async function handleConnectionCheck() {
    if (!user) {
      return;
    }

    setIsChecking(true);
    setStatusMessage("Writing a test document to Firestore...");

    try {
      await writeConnectionCheck(user);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Check failed.");
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

  function handleStageThreeAction(action: string) {
    setStatusMessage(`${action} is coming in Stage 3: lobby creation and joining.`);
  }

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

        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1fr_360px]">
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
                className="inline-flex h-12 items-center justify-center rounded border border-ink bg-ink px-5 text-base font-bold text-white transition hover:bg-black"
                onClick={() => handleStageThreeAction("Create Room")}
                type="button"
              >
                Create Room
                <ArrowRight aria-hidden="true" className="ml-2 h-5 w-5" />
              </button>
              <button
                className="inline-flex h-12 items-center justify-center rounded border border-line bg-white px-5 text-base font-bold transition hover:border-ink"
                onClick={() => handleStageThreeAction("Join Room")}
                type="button"
              >
                Join Room
              </button>
            </div>
          </section>

          <aside className="rounded-lg border border-line bg-white p-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <p className="text-sm font-semibold text-muted">Room code</p>
                <p className="text-3xl font-black tracking-[0.16em]">K9QW</p>
              </div>
              <button
                aria-label="Copy room code"
                className="flex h-10 w-10 items-center justify-center rounded border border-line transition hover:border-ink"
                onClick={() => handleStageThreeAction("Copy room link")}
                type="button"
              >
                <Copy aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

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
          </aside>
        </div>

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
                    onClick={() => void signOutCurrentUser()}
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
