# Firebase Setup — Beginner's Walkthrough

> A step-by-step guide to setting up Firebase for the Categories game.
> Written for someone who has never used Firebase before.
> Total time: ~30 minutes.

---

## Before you start

You'll need:
- A Google account (any Gmail/Workspace account works).
- A web browser.
- A terminal (PowerShell on Windows, Terminal on Mac/Linux). Don't worry — you'll only run a handful of commands.
- Node.js installed (version 18 or later). Check with `node --version`. If you don't have it, install from nodejs.org first.

You will **not** need to enter a credit card. We're staying on the free Spark plan throughout.

---

## What you're about to do

1. Create a Firebase project (a "container" for everything).
2. Enable the database (Firestore).
3. Enable sign-in (Authentication).
4. Grab the config snippet you'll later paste into your game code.
5. Install the Firebase command-line tool.
6. Do a small sanity check to confirm it all works.

That's it. After this, you (or Claude Code) can start building the actual game.

---

## Step 1 — Create the Firebase project

1. Open **console.firebase.google.com** in your browser.
2. Sign in with your Google account.
3. Click the big **"Create a Firebase project"** card (or "Add project" if you've used Firebase before).
4. **Project name:** `categories-game` (or whatever you like — it's just a label).
5. Firebase will suggest a project ID below the name, something like `categories-game-a1b2c`. **Write this down** — you'll need it later. Project IDs are globally unique, so yours will have a random suffix.
6. **Google Analytics:** When asked, choose **"Disable Google Analytics for this project"**. You don't need it for a family game, and it adds clutter.
7. Click **"Create project"** and wait ~30 seconds while Firebase sets things up.
8. When it finishes, click **"Continue"** to go to the project dashboard.

**You should now see:** the Firebase project dashboard, with a sidebar showing options like "Authentication", "Firestore Database", "Storage", etc.

---

## Step 2 — Enable Firestore (the database)

1. In the left sidebar, click **"Build"** → **"Firestore Database"**.
2. Click the big **"Create database"** button.
3. **Location:** Choose `eur3 (europe-west)` or `europe-west2 (London)`. Once set, this cannot be changed. For UK family use, London is ideal.
4. **Security rules starting mode:** Choose **"Start in production mode"**. This locks the database to no access by default — we'll write proper rules later. Don't pick "test mode"; it opens your database to the entire internet for 30 days.
5. Click **"Create"** and wait ~30 seconds.

**You should now see:** an empty Firestore database with three tabs at the top — "Data", "Rules", "Indexes". You're on the Data tab. It says "No collections yet". That's correct — your game will create collections when it runs.

### Quick sanity check
Click the **"Rules"** tab. You should see something like:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

The `if false` is what makes "production mode" safe — nothing can read or write yet. We'll relax this later via a `firestore.rules` file in your code repo.

---

## Step 3 — Enable Authentication (sign-in)

1. In the left sidebar, click **"Build"** → **"Authentication"**.
2. Click the **"Get started"** button.
3. You'll land on the "Sign-in method" tab with a list of providers.

### Enable Google sign-in
1. Click **"Google"** in the provider list.
2. Toggle **"Enable"** on.
3. **Project support email:** Pick your email from the dropdown.
4. Click **"Save"**.

### Enable Anonymous sign-in
1. Back on the provider list, click **"Anonymous"** (you may need to scroll, it's under "Additional providers").
2. Toggle **"Enable"** on.
3. Click **"Save"**.

**You should now see:** Both "Google" and "Anonymous" listed under "Sign-in providers" with status "Enabled".

---

## Step 4 — Grab the config snippet

This is the bit of JSON that tells your game code how to talk to your Firebase project.

1. In the top-left, click the **gear icon** ⚙️ next to "Project Overview", then **"Project settings"**.
2. Scroll down to **"Your apps"**. There won't be any yet.
3. Click the **web icon** `</>` to register a web app.
4. **App nickname:** `categories-game-web` (or anything — just a label).
5. **Firebase Hosting:** Leave the "Also set up Firebase Hosting" checkbox **unticked**. We're using GitHub Pages, not Firebase Hosting.
6. Click **"Register app"**.
7. Firebase shows you a code snippet that looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "categories-game-a1b2c.firebaseapp.com",
  projectId: "categories-game-a1b2c",
  storageBucket: "categories-game-a1b2c.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

8. **Copy this whole block somewhere safe** — a text file, a note, wherever. You'll paste it into your project later. (You can always come back to Project Settings to retrieve it again, but save yourself the click.)
9. Click **"Continue to console"**.

> **About those keys:** Despite the name, `apiKey` is *not a secret*. It just identifies your Firebase project. Real security comes from the Firestore rules and Auth settings — not from hiding this value. It's safe to commit to your public GitHub repo. Every Firebase tutorial confirms this; it confuses everyone the first time.

---

## Step 5 — Install the Firebase CLI

The Firebase command-line tool lets you deploy security rules from your computer to your Firebase project. You'll use it occasionally, not constantly.

Open your terminal and run:

```bash
npm install -g firebase-tools
```

The `-g` means "install globally" — it adds a `firebase` command you can run from anywhere.

When it finishes, check it worked:

```bash
firebase --version
```

You should see a version number like `13.15.4`. If you get "command not found", restart your terminal and try again.

Now log in:

```bash
firebase login
```

This opens a browser window asking you to sign in with the same Google account you used for the Firebase console. Allow the requested permissions. The terminal should then say `Success! Logged in as <your-email>`.

Test that the CLI can see your project:

```bash
firebase projects:list
```

You should see your `categories-game-...` project in the list. If you do, the CLI is working.

---

## Step 6 — Sanity check (optional but recommended)

This is a 5-minute check that everything is wired up. It also gives you a feel for how Firestore works.

1. In the Firebase console, go to **Firestore Database** → **Data** tab.
2. Click **"Start collection"**.
3. **Collection ID:** `test`. Click **Next**.
4. **Document ID:** click **"Auto-ID"** to let Firebase pick one.
5. Add a field: **Field name** `message`, **Type** `string`, **Value** `hello world`.
6. Click **"Save"**.

You've just created your first Firestore document by hand. The same thing your game code will do, just from a browser instead. You should see the document appear in the database view.

To clean up: hover over the `test` collection, click the three-dot menu, and **"Delete collection"**. Confirm.

---

## You're done

You now have:
- ✅ A Firebase project ready to use
- ✅ Firestore database enabled and locked down
- ✅ Google and Anonymous sign-in enabled
- ✅ Your config snippet saved somewhere
- ✅ The Firebase CLI installed and logged in

When you hand the spec to Claude Code, tell it:

> "My Firebase project ID is `categories-game-a1b2c` (use yours). I've enabled Firestore in europe-west2 and turned on Google + Anonymous auth. Here's my firebaseConfig: [paste]. Start at step 1 of the build plan."

Claude Code will take it from there.

---

## Troubleshooting

**"npm command not found"** — Node.js isn't installed. Get it from nodejs.org and reopen your terminal.

**"firebase command not found" after install** — Close and reopen your terminal. On Windows, you may need to open a new PowerShell window. If it still doesn't work, run `npm config get prefix` and make sure that path is in your system PATH variable.

**"Permission denied" when running `npm install -g`** — On Mac/Linux, you may need `sudo npm install -g firebase-tools`. On Windows, run PowerShell as Administrator.

**Lost your `firebaseConfig`?** — Firebase Console → ⚙️ Project Settings → scroll to "Your apps" → click the `</>` icon next to your web app → "SDK setup and configuration" → "Config".

**Want to delete the project and start over?** — Project Settings → scroll to the very bottom → "Delete project". This is fine and free — Firebase projects are disposable.

---

## What's next

You're ready to start building. The build plan is in `categories-game-spec.md` section 9. Step 1 is just "create a Vite + React project and deploy a hello-world page to GitHub Pages" — nothing Firebase-specific yet. Firebase work begins at step 2.

Take it slow on the first couple of steps. The whole project gets much easier once you've seen Firestore data flow back and forth in your own app for the first time — there's a "oh, that's all it is" moment that makes everything else click.
