import { ArrowRight, Copy, UsersRound } from "lucide-react";

const sampleCategories = [
  "Animal",
  "Things you find in a kitchen",
  "Famous landmarks",
  "Foods you eat with your hands",
  "Things that come in pairs",
];

function App() {
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
              <button className="inline-flex h-12 items-center justify-center rounded border border-ink bg-ink px-5 text-base font-bold text-white transition hover:bg-black">
                Create Room
                <ArrowRight aria-hidden="true" className="ml-2 h-5 w-5" />
              </button>
              <button className="inline-flex h-12 items-center justify-center rounded border border-line bg-white px-5 text-base font-bold transition hover:border-ink">
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
      </section>
    </main>
  );
}

export default App;
