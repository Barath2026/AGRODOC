from .auth import router as auth_router
from .fields import router as fields_router
from .diagnosis import router as diagnosis_router
from .reports import router as reports_router
from .dashboard import router as dashboard_router
from .contact import router as contact_router
from .health import router as health_router

__all__ = [
    "auth_router",
    "fields_router",
    "diagnosis_router",
    "reports_router",
    "dashboard_router",
    "contact_router",
    "health_router",
]
