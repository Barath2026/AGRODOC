import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import settings
from .routes import (
    auth_router,
    fields_router,
    diagnosis_router,
    reports_router,
    dashboard_router,
    contact_router,
    health_router,
)
from .init_db import init_database, preload_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("agrodoc.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting AgroDoc Field Intelligence API...")
    try:
        init_database()
    except Exception as e:
        logger.error(f"Error during database startup initialization: {e}")

    try:
        preload_model()
    except Exception as e:
        logger.error(f"Error pre-warming deep learning model: {e}")

    logger.info("AgroDoc backend is fully initialized and ready to serve requests.")
    yield
    # Shutdown
    logger.info("Shutting down AgroDoc API.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API and ML Services for AgroDoc AI-Powered Tomato Crop Health and Disease Detection System",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for development and local testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# Mount routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(fields_router)
app.include_router(diagnosis_router)
app.include_router(reports_router)
app.include_router(dashboard_router)
app.include_router(contact_router)
