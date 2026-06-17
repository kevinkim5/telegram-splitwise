from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    bot_token: str = ""
    # Vercel Neon integration injects these automatically:
    #   POSTGRES_URL             — pooled (pgBouncer), avoid with asyncpg
    #   POSTGRES_URL_NON_POOLING — direct connection, preferred for asyncpg
    # For local dev, set DATABASE_URL in .env instead.
    postgres_url_non_pooling: str = ""
    postgres_url: str = ""
    database_url: str = "postgresql://localhost/splitwise"

    frontend_dist: str = "frontend/dist"
    allowed_origins: list[str] = ["*"]
    webapp_url: str = ""

    @property
    def db_url(self) -> str:
        return self.postgres_url_non_pooling or self.postgres_url or self.database_url

    class Config:
        env_file = ".env"


settings = Settings()
