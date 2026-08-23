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
    print("[INFO] MongoDB connected and indexes verified")

    yield

    # -- Shutdown --
    await close_db()
    print("[INFO] MongoDB connection closed")


app = FastAPI(
    title="Campus Print API",
    description="Backend API for the Campus Print application - "
                "token-based asynchronous print job management.",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://campus-print-app.vercel.app",  # Add your exact Vercel URL
    "*"  # Or use "*" during testing to allow all origins
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- CORS --
# Allow the React frontend (localhost:3000) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
