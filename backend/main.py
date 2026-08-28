import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.dependencies import connect_db, close_db
from api.routes import auth, jobs, payments
from core.security import init_firebase


# Create uploads directory at module level
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle events."""
    # -- Startup --
    init_firebase()
    await connect_db()
    print("[INFO] Campus Print Backend initialized and ready")

    yield

    # -- Shutdown --
    await close_db()
    print("[INFO] Campus Print Backend shutdown complete")


app = FastAPI(
    title="Campus Print API",
    description="Backend API for the Campus Print application - "
                "token-based asynchronous print job management.",
    version="1.0.0",
    lifespan=lifespan,
)

# -- CORS --
# Allow all origins (localhost:3000, localhost:5173, Vercel, etc.) with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?:\/\/.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# -- Serve uploaded files as static files --
# Files saved to backend/uploads/ will be accessible at http://localhost:8000/files/...
app.mount("/files", StaticFiles(directory=UPLOADS_DIR), name="files")

# -- Register Routers --
app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(payments.router)


# -- Health Check --
@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "service": "Campus Print API"}
