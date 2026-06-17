from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    bot_token: str = ""
    database_url: str = "postgresql://localhost/splitwise"
    frontend_dist: str = "frontend/dist"
    allowed_origins: list[str] = ["*"]
    webapp_url: str = ""  # The Vercel deployment URL (needed for webhook setup)

    class Config:
        env_file = ".env"


settings = Settings()
