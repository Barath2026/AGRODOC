# AgroDoc — Complete Integrated Project

This archive combines the frontend, FastAPI backend, tomato disease ML model, training script, dataset, and integration tests into one project.

## Project structure
- `frontend/` — React + Vite UI
- `backend/app/` — FastAPI routes, database, authentication, recommendations, and ML inference
- `backend/models/agrodoc_tomato_model.pth` — existing model checkpoint (preserved; not retrained)
- `backend/scripts/train_tomato_model.py` — model training/evaluation script
- `backend/tests/` — ML safety and backend integration tests
- `dataset/` — train/validation/test images

## Run backend (Windows PowerShell)
From the `Agrodoc` project root:

```powershell
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
Copy-Item backend/.env.example backend/.env
python run_backend.py
```

If using Command Prompt, activate with `.venv\Scripts\activate.bat`. Review `backend/.env` and replace the example `SECRET_KEY` before deployment. The default config supports a local SQLite fallback; if using MySQL, configure `DATABASE_URL` and ensure the database is running.

API docs: `http://127.0.0.1:8000/docs`

## Run frontend
Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). The frontend dev proxy forwards `/api` requests to `http://127.0.0.1:8000`; see `frontend/.env.example` and `frontend/vite.config.js`.

## Tests
From the `Agrodoc` project root, after installing backend requirements:

```powershell
python -m unittest backend.tests.test_ml_safety -v
python -m unittest backend.tests.test_backend -v
```

Backend integration tests may require optional runtime dependencies and a working database configuration. Run the ML safety tests first for fast isolated regression checks.

## Retrain (optional)
Do not overwrite the preserved checkpoint until a new model has been evaluated. From project root:

```powershell
python backend/scripts/train_tomato_model.py --epochs 15 --batch-size 32
```

Training may require downloading pretrained weights and can take significant time.

## Security
No real `.env` file or credentials are included. Create it from `.env.example`, use a strong secret, and never commit `.env`, local databases, uploads, or generated reports.

## Evaluation note
The previous evaluation reported 96.01% accuracy on 677 images in the project's held-out test folder. This is a dataset-specific result, not a guarantee of field performance; validate against independent real-world photographs before deployment.
