# AgroDoc — Backend API

Owns FastAPI routes, schemas, database models/configuration, authentication, report and recommendation services, and backend dependencies.

## Team integration
- Extract this ZIP into the shared AgroDoc repository root, preserving the `Agrodoc/` directory structure.
- Commit only this module's files. Do not replace another teammate's module files.
- All four modules belong in the same repository; these are not four independent applications.
- Keep `.env` files, credentials, and private deployment secrets out of Git.

## Main location
`Agrodoc/backend/` excluding `app/ml/`, `models/`, `scripts/`, and ML tests (owned by Module 3).

## Dependency note
This API module calls the ML inference layer from Module 3. Merge both modules before running the complete app.
