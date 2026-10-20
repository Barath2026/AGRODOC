import os
import sys
import uvicorn

# Ensure project root is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

if __name__ == "__main__":
    from app.config import settings
    print(f"Starting AgroDoc backend on http://{settings.host}:{settings.port}")
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False, log_level="info")
