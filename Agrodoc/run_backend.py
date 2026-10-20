import os
import sys
import uvicorn

root_dir = os.path.dirname(os.path.abspath(__file__))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

if __name__ == "__main__":
    from backend.app.config import settings
    print(f"Starting AgroDoc backend on http://{settings.host}:{settings.port}")
    uvicorn.run("backend.app.main:app", host=settings.host, port=settings.port, reload=False, log_level="info")
