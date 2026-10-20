import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

logger = logging.getLogger("agrodoc.database")

Base = declarative_base()

def get_engine():
    # Try MySQL first
    try:
        engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_recycle=3600,
            echo=False
        )
        # Test connection
        with engine.connect() as conn:
            logger.info("Successfully connected to MySQL database.")
        return engine
    except Exception as e:
        logger.warning(
            f"Could not connect to MySQL at {settings.database_url}: {e}. "
            f"Falling back to SQLite: {settings.fallback_sqlite_url}"
        )
        engine = create_engine(
            settings.fallback_sqlite_url,
            connect_args={"check_same_thread": False},
            echo=False
        )
        return engine

engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
