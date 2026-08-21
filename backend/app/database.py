from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080

    r2_account_id: str
    r2_access_key: str
    r2_secret_key: str
    r2_bucket: str
    r2_public_url: str

    # Comma-separated list of allowed frontend origins for CORS, e.g.
    # "https://app.example.com,https://example.com". Defaults to the local
    # Vite dev server so nothing extra is needed for local development.
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()

# pool_pre_ping + pool_recycle guard against hosted Postgres providers (Railway,
# Render, etc.) silently closing idle connections — without these, SQLAlchemy can
# hand out a dead connection from the pool and fail with "SSL SYSCALL error: EOF
# detected" on the first query after a period of inactivity.
engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
