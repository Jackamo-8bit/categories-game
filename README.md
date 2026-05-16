# Categories

A live multiplayer category-guessing game for family and friends. The app is built as a static React site and will use Firebase Auth and Firestore for realtime multiplayer.

## Local Development

```bash
npm install
npm run dev
```

The local app runs at `http://127.0.0.1:5173/` by default.

## Checks

```bash
npm run lint
npm run build
```

## Deployment

The project includes a GitHub Actions workflow for GitHub Pages. Once the repository is pushed to GitHub and Pages is enabled for GitHub Actions, pushes to `main` will build and deploy the `dist` output.

## Firebase

Firebase wiring starts in stage 2. The intended setup is:

- Firebase Spark plan
- Firestore for realtime game state
- Firebase Auth with Google and anonymous sign-in
- No Cloud Functions for v1
