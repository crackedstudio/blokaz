# Blokz Signing Server

This server handles session signing and score verification for Blokz Tournaments.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment — copy the example and fill in your signer key:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and set `SIGNER_PRIVATE_KEY` to the key that owns the signer role on the contract.

## Running

```bash
# Standard
node index.js

# Using the npm script
npm run dev
```

## API Endpoints

- `POST /sign-start`: Generates a game seed and signature to begin a tournament match.
- `POST /sign-submit`: Validates the final score and returns a signature for on-chain submission.
