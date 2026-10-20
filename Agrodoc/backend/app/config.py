import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AgroDoc Field Intelligence API"
    app_version: str = "1.0.0"
    model_version: str = "tomato-mobilenetv3-v1"

    # Database
    database_url: str = "sqlite:///./agrodoc.db"
    fallback_sqlite_url: str = "sqlite:///./agrodoc.db"

    # Security
    secret_key: str = "dev-only-change-this-secret-before-deployment"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    # ML Model
    model_path: str = "backend/models/agrodoc_tomato_model.pth"
    confidence_threshold: float = 60.0

    # Uploads & Storage
    max_upload_mb: int = 10
    upload_dir: str = "backend/uploads"
    report_dir: str = "backend/reports"

    # Network / CORS
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
    host: str = "127.0.0.1"
    port: int = 8000

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_model_path(self) -> str:
        # Check absolute or relative to project root
        p = Path(self.model_path)
        if p.is_absolute() and p.exists():
            return str(p)
        
        # Check relative to backend dir or current working dir
        base_dir = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        backend_p = base_dir / "models" / "agrodoc_tomato_model.pth"
        if backend_p.exists():
            return str(backend_p)
            
        root_p = base_dir.parent / "backend" / "models" / "agrodoc_tomato_model.pth"
        if root_p.exists():
            return str(root_p)

        return str(p)


settings = Settings()

# Ensure directories exist
os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs(settings.report_dir, exist_ok=True)
