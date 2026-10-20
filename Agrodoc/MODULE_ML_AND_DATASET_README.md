# AgroDoc — ML & Dataset

Owns the tomato disease ML inference/preprocessing code, model checkpoint, training script, ML safety tests, and train/validation/test image dataset.

## Team integration
- Extract this ZIP into the shared AgroDoc repository root, preserving the `Agrodoc/` directory structure.
- Commit only this module's files. Do not replace another teammate's module files.
- All four modules belong in the same repository; these are not four independent applications.
- Keep `.env` files, credentials, and private deployment secrets out of Git.

## Main locations
`Agrodoc/backend/app/ml/`, `Agrodoc/backend/models/`, `Agrodoc/backend/scripts/`, `Agrodoc/backend/tests/test_ml_safety.py`, and `Agrodoc/dataset/`.

## Caution
The dataset makes this ZIP substantially larger than the other modules. Preserve the checkpoint until a newly trained model has been evaluated.
