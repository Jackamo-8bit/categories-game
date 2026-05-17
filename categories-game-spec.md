# Letterly — Game Design & Build Spec

> A live multiplayer category-guessing game for family and friends.
> Built as a static web app on GitHub Pages with Firebase for live multiplayer.
> No live AI, no runtime costs, no surprise bills.

---

## 1. Overview

**Name:** Letterly (avoid "Scattergories" — Hasbro trademark)

**Concept:** Players join a shared lobby. Each round, a random letter is chosen and players race to write answers starting with that letter for a list of categories before a timer expires. Answers are then scored: unique answers score 2 points, shared answers score 1 point, and invalid answers score 0. The player with the highest total after N rounds wins.

**Inspiration:** Visual and interaction style modelled on NYT Wordle and Connections — clean typography, generous whitespace, soft pastel accents, minimal chrome, mobile-first.

**Platforms:** Responsive web app (mobile + desktop), single codebase.

**Hosting:** GitHub Pages (frontend) + Firebase (backend). Zero runtime cost.

---

## 2. Getting Started — Backend for Beginners

Read this section before anything else. If you understand what's in here, the rest of the spec will make sense.

### 2.1 Why we need a "backend" at all

You can build a single-player word game with just HTML, CSS, and JavaScript hosted on GitHub Pages. The browser does everything.

But this game is *multiplayer in real time* — when your brother-in-law types an answer on his phone, your screen needs to know about it within a second or two. That requires a **shared place** where everyone's game state lives, and a way for each player's browser to **stay in sync** with that shared state.

That shared place is what people mean by "backend". It's not necessarily a server you write code for — it can be a managed service that handles it for you. Firebase is that managed service.

### 2.2 What Firebase actually is (in plain English)

Firebase is a Google product that gives you four things you'd otherwise have to build yourself:

1. **Firestore** — A cloud-hosted database. You write to it from one browser, and every other browser that's "listening" gets the update automatically within ~1 second. This is the bit that makes the game feel live. Think of it like a SharePoint list that pushes updates to subscribers, but designed for app data, not documents.

2. **Authentication** — Sign-in handled for you. You can let people sign in with Google in one click, or "anonymously" (Firebase issues them a unique ID without asking for any info — good for guests).

3. **Hosting** — A way to serve a website. We're **not using this** — you want GitHub Pages, and that's fine. Firebase happily provides just the data + auth bits.

4. **Cloud Functions** — Server-side code that runs when triggered. We're **not using this in v1** either, because we dropped live AI. One less thing to learn.

### 2.3 What it costs

Firebase has a free tier called "Spark plan". Limits per day:
- 50,000 database reads
- 20,000 database writes
- 1 GiB of storage

A family game with 6 players over 5 rounds will use maybe 500 reads and 200 writes total. You will not come close to the limits. You don't even need to enter a credit card.

If you somehow blow through the free tier, Firebase **stops serving requests** rather than billing you. To get charged you'd have to actively upgrade to the paid "Blaze plan" and enter a card. Don't do that and you cannot be charged.

### 2.4 How a typical game works under the hood

Just so the data flow is concrete:

1. You (host) sign in with Google. Firebase Auth gives you a unique user ID (UID).
2. You tap "Create room". Your browser writes a new document to Firestore at `/rooms/AB12` with status `lobby` and you listed as host.
3. Your brother-in-law opens the link with code `AB12`. He signs in (anonymously, say). His browser writes his UID to `/rooms/AB12/players/{his-uid}`.
4. Your browser was **listening** for changes to `/rooms/AB12/players`. Firestore pushes the update. His name appears in your lobby instantly. No reload.
5. You tap "Start". Your browser updates the room status to `playing` and writes the letter and categories. Every player's browser is listening and immediately switches to the play screen.
6. Each player types answers locally, then submits — which writes their answers to `/rooms/AB12/rounds/1/answers/{uid}`. Other browsers see "X is done" appear on the lobby.
7. When everyone's submitted (or the timer expires), the host's browser computes scores from all the answer documents and writes them back.

That's it. Firestore is the shared whiteboard, and every browser is both reading and writing to it. No traditional server is involved.

### 2.5 What you'll need to set up (one-time, ~30 minutes)

Before writing any game code:

1. **Create a Firebase account** at console.firebase.google.com — uses your Google account, no card needed.
2. **Create a project** in the Firebase console (call it "categories-game" or similar).
3. **Enable Firestore** — pick "production mode" and a region near you (europe-west2 for UK).
4. **Enable Authentication** — turn on "Google" sign-in provider and "Anonymous" sign-in provider.
5. **Copy the config snippet** — Firebase gives you a small JSON blob with project IDs and API keys. This goes into your frontend code. (These keys are *public-safe* despite being called keys — they identify your project, not authorise actions. Actual permissions are controlled by Firestore security rules.)
6. **Install the Firebase CLI** — `npm install -g firebase-tools`, then `firebase login`. You only need this for deploying security rules.

When Claude Code starts building, tell it your Firebase project ID and it will wire up the rest.

### 2.6 The mental model

Two phrases worth remembering, because every Firebase tutorial uses them:

- **"Realtime listener"** — code that subscribes to a part of the database and gets called whenever it changes. We use these everywhere.
- **"Security rules"** — a small file that defines who can read/write what. Critical to get right or anyone could mess with your data. Spec includes a starting set in section 6.

That's the whole mental model. You're not learning to code a server; you're learning to read/write a magic database that pushes updates everywhere automatically.

---

## 3. Game Rules

### 3.1 Round Flow

1. **Lobby** — Host creates a room, gets a 4–6 character room code, shares with players. Players join via code or link.
2. **Setup** — Host configures: number of rounds, timer length (default 90s), category source (preset pack / custom list / random from the big pool), number of categories per round (default 10).
3. **Round Start** — A letter is drawn (A–Z, excluding rarely-used X, Z by default — configurable). All players see the same letter and category list.
4. **Answer Phase** — Each player privately types one answer per category. Timer counts down. Answers auto-submit when timer hits zero or when the player taps "Done".
5. **Review/Vote Phase** — All answers are revealed grouped by category. Each player can flag any answer (including their own) as invalid. Majority of *other* players auto-invalidates.
6. **Scoring** — Points calculated and revealed with a brief animation. Cumulative scores update on the leaderboard.
7. **Next Round** — The next letter-picker rotates through players. Repeat until N rounds complete.
8. **Game End** — Final leaderboard with stats. Option to rematch with same players.

### 3.2 Scoring Rules

- **2 points** — Valid answer, no other player gave the same answer (case- and whitespace-insensitive match).
- **1 point** — Valid answer, at least one other player gave the same answer.
- **0 points** — Invalid answer (wrong starting letter, blank, or voted invalid).
- **Tiebreaker** — Most unique answers across the game. If still tied, sudden-death round with one category.

### 3.3 Validity Determination

Pure player vote:

- Any player can tap an answer during the review phase to flag it.
- If a strict majority of *non-author* players flag it (i.e. more than half), it becomes invalid.
- Wrong-letter answers are *also* auto-flagged by the code itself — no point voting on something that obviously doesn't start with the right letter.
- Blank answers are automatically zero.

This keeps things simple and matches the physical board game. If AI judging is wanted later, it's an additive feature for v2.

---

## 4. Category Pool (the AI bit, done at design time)

This is the one place AI is used — **once, by you, before you ship**. Generated output is committed to the repo as a static JSON file. No runtime API calls.

### 4.1 Approach

Open Claude.ai (or any LLM), and ask something like:

> "Generate a JSON array of 500 family-friendly category names for a Scattergories-style word game. Mix easy, medium, and hard difficulty. Cover a wide range of topics: food, animals, places, history, hobbies, household, entertainment, science, nature, sport, people types, things you wear, things you find in [place], etc. Vary the structure — some 'A type of X', some 'Things that are Y', some single concepts. No duplicates. Output the JSON only."

Run it a few times, merge the results, dedupe, manually trim anything weird, then save as `src/data/categoryPool.json`. Aim for 500–1000 categories.

### 4.2 Preset packs

In addition to the giant random pool, ship 4–6 themed packs that players can pick instead of "random":

- **Classic** (animal, country, food, name, colour, etc. — traditional board game vibe)
- **Pop Culture** (movies, songs, video games, celebrities…)
- **For Kids** (simpler, more concrete — toys, snacks, school things…)
- **Tricky** (compound categories, abstract concepts — "things that come in pairs", "words that rhyme with x"…)

These are also static JSON files in the repo.

### 4.3 Custom

Host can type their own list in the lobby settings. Stored on the room document, not persisted globally.

---

## 5. Tech Stack

### 5.1 Frontend

- **Framework:** React 18 + Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State:** Zustand for local UI state; Firestore listeners for game state
- **Routing:** React Router (home, lobby, game, results)
- **Animations:** Framer Motion (light use)

### 5.2 Backend

- **Firestore** — All game state, with realtime listeners
- **Firebase Auth** — Google sign-in + Anonymous sign-in
- **Security Rules** — Defined in `firestore.rules`, deployed via Firebase CLI
- **No Cloud Functions in v1** — scoring happens client-side (host computes and writes)

### 5.3 Hosting

- **Frontend:** GitHub Pages via GitHub Actions on push to `main`
- **Firebase project:** Set up once, no ongoing deploys needed unless rules change

---

## 6. Data Model (Firestore)

```
/rooms/{roomCode}
  - code: string (4–6 chars, uppercase)
  - hostUid: string
  - status: 'lobby' | 'playing' | 'reviewing' | 'scoring' | 'finished'
  - createdAt: timestamp
  - lastActivityAt: timestamp
  - settings:
      - totalRounds: number
      - timerSeconds: number
      - categoriesPerRound: number
      - excludedLetters: string[]
      - categorySource: 'random' | 'pack' | 'custom'
      - packId?: string
      - customCategories?: string[]
  - currentRound: number
  - currentLetter?: string
  - currentCategories?: string[]
  - roundEndsAt?: timestamp
  - letterPickerOrder: string[]  (UIDs in rotation order)

  /players/{uid}
    - displayName: string
    - avatar: string  (emoji or initial)
    - joinedAt: timestamp
    - score: number
    - connected: boolean
    - lastSeenAt: timestamp

  /rounds/{roundNumber}
    - letter: string
    - categories: string[]
    - startedAt: timestamp
    - endedAt?: timestamp

    /answers/{uid}
      - values: { [categoryIndex: number]: string }
      - submittedAt: timestamp

    /verdicts/{uid_categoryIndex}
      - answer: string
      - flags: string[]   (UIDs who flagged invalid)
      - finalValid: boolean
      - points: number
```

### Security Rules (starting set)

In plain English, the rules should enforce:

- Anyone signed in (including anonymous) can read a room they're a member of.
- Only the host can change `settings`, `status`, `currentRound`, `currentLetter`, or `currentCategories`.
- A player can only write their own `/players/{uid}` document.
- A player can only write their own `/answers/{uid}` document during the `playing` phase.
- A player can add/remove their own UID to/from `flags` arrays during the `reviewing` phase.
- Final verdicts and scores are written by the host's browser at scoring time (acceptable trust model for family use; harden later if it ever goes public).

Claude Code can generate the actual `firestore.rules` syntax from this when wiring things up.

---

## 7. Screens & UX

All screens follow the Wordle/Connections aesthetic: large readable type, generous spacing, soft palette, no skeuomorphism, no gradients.

### 7.1 Home / Landing
Game logo, "Create Room" and "Join Room" buttons, recent games list (if signed in). Sign in with Google (optional — anonymous is fine for guests).

### 7.2 Lobby
Room code displayed large with copy-link button and QR code for mobile. Player list with avatars, host indicator. Settings panel (host only): rounds, timer, categories source. "Start Game" button enabled when ≥ 2 players present.

### 7.3 Round — Answer Phase
Letter shown large at top. Timer ring counting down. Category list as input fields, one per row. "Submit early" button locks in your answers; you wait for others.

### 7.4 Round — Review Phase
Answers grouped by category, one section per category. Each answer shows the player's avatar and the answer text. Tap an answer to flag it; flag count visible. Wrong-letter answers shown crossed out automatically. Auto-advances to scoring when all players ready or after 30s.

### 7.5 Round — Scoring
Animated point reveals per category. Updated leaderboard at the bottom. "Next round" button (host) or auto-advance after a few seconds.

### 7.6 Game End
Final leaderboard with confetti for winner. Per-player stats: most unique answers, best category, total valid answers. "Rematch" and "New Game" buttons.

### 7.7 Profile (signed-in only)
Games played, win rate, best round score, favourite category.

---

## 8. MVP Scope (v1)

In scope:
- ✅ Lobby creation and joining via code
- ✅ Live multiplayer with realtime state sync
- ✅ Preset category packs (Classic, Pop Culture, Kids, Tricky)
- ✅ Random selection from a large category pool (500+ entries)
- ✅ Custom category lists (host enters their own)
- ✅ Player-voted invalidation (majority rule)
- ✅ Scoring (2 unique / 1 shared / 0 invalid)
- ✅ Multi-round games with rotating letter-pickers
- ✅ Player accounts (Google) and basic stats
- ✅ Mobile + desktop responsive design

Out of scope (backlog):
- AI category generation at runtime
- AI answer judging
- Spectator mode
- Rule variants (double-letter rounds, themed games)
- Friend lists, private leagues
- Replay viewer
- Localisation beyond English
- Push notifications

---

## 9. Build Plan (suggested order)

Each step a discrete PR / commit-set. Order chosen so you have something playable as early as possible.

1. **Project scaffold** — Vite + React + TS + Tailwind, deployed to GitHub Pages via Actions. "Hello world" page live.
2. **Firebase setup** — Project created, Firestore + Auth enabled, SDK wired into frontend, Google + anonymous sign-in working. Test by writing a "hello" doc from one tab, reading it in another.
3. **Lobby flow** — Create room, join room, player list updates in realtime.
4. **Single-round local game** — Letter draw, timer, answer inputs, basic scoring with no voting. Categories hardcoded.
5. **Multi-round + leaderboard** — Round rotation, persistent scores, end-of-game screen.
6. **Category pool + preset packs** — Static JSON files committed; lobby settings to pick source.
7. **Player vote/flag system** — Review phase, flag UI, majority resolution computed client-side.
8. **Polish** — Animations, mobile tuning, QR code, share links, copy-link.
9. **Accounts + stats** — User profile page, game history (Firestore collection per user).
10. **Hardening** — Security rules audit, inactive-room cleanup (client-side check on lobby load; delete rooms with no activity in 24h), error states.

You should have a playable family game after step 5. Everything after is polish and persistence.

---

## 10. Design Tokens (starting point)

```
Background:     #FAFAF7  (warm off-white, like Connections)
Surface:        #FFFFFF
Text primary:   #1A1A1A
Text muted:     #6B6B6B
Border:         #E5E5E0
Accent (focus): #5A8DEE  (calm blue)
Success:        #6AAA64  (Wordle green)
Warning:        #C9B458  (Wordle yellow)
Error:          #D9534F  (muted red)

Font: Inter or system-ui, with a heavier display weight for the letter reveal.
Radius: 8px standard, 16px for cards.
Shadows: Avoid. Use 1px borders for separation.
```

---

## 11. Open Questions for Future Decisions

Not blockers for v1, but worth thinking about as you build:

- **Game length default** — 5 rounds feels right for a quick game, 10 for longer. Start at 5.
- **Letter weighting** — Exclude Q, X, Z by default? Probably yes, with a "hard mode" toggle to include them.
- **Disconnect handling** — If a player drops mid-round: auto-forfeit that round, allow rejoin for next. Track via `connected` and `lastSeenAt` heartbeat.
- **Anti-cheat** — Answers technically visible in network traffic before reveal. Acceptable for family; harden later if needed.
- **Profanity filter** — Not needed for family. Could add a "kid mode" toggle later.

---

## 12. Notes for the AI Coding Tool (Claude Code / Codex)

When handing this spec over:

- Build screens in the order from Section 9 — don't try to scaffold everything at once.
- Always run the app and verify each step before moving on.
- Use Firestore listeners (`onSnapshot`) for game state — do NOT poll.
- The user is a beginner with backend tooling. Explain each Firebase concept the first time it appears in code, and don't assume familiarity with auth flows, security rules, or Firestore data modelling.
- All client code that reads from Firestore should handle the "loading" and "error" states explicitly, not just the happy path.
- Generate the `firestore.rules` file from Section 6's plain-English description and deploy it before the app goes anywhere near real users.
- Write a clear `README.md` covering: how to install dependencies, how to run locally, how to create the Firebase project, where to put the Firebase config, and how the GitHub Pages deploy works.
- The Firebase config (`apiKey`, `projectId`, etc.) is *public-safe* — it can live in source or in `.env.local`, doesn't matter. Don't pretend it's a secret.
- Keep the category pool generation out of scope — the user will provide `src/data/categoryPool.json` themselves.
