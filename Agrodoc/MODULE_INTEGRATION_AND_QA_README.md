# AgroDoc — Integration & QA

Owns integration entry points, editor configuration, and backend integration tests. Use this role to coordinate the final merge and run cross-module checks.

## Team integration
- Extract this ZIP into the shared AgroDoc repository root, preserving the `Agrodoc/` directory structure.
- Commit only this module's files. Do not replace another teammate's module files.
- All four modules belong in the same repository; these are not four independent applications.
- Keep `.env` files, credentials, and private deployment secrets out of Git.

## Main locations
`Agrodoc/run_backend.py`, `Agrodoc/.vscode/`, and `Agrodoc/backend/tests/test_backend.py`.

## Integration checklist
1. Merge Modules 1–3 into the same repository.
2. Configure environment variables using `Agrodoc/backend/.env.example`.
3. Install backend dependencies and frontend dependencies.
4. Run ML safety tests and backend tests; document any tests blocked by missing services or dependencies.
