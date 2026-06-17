from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    bot_token: str = ""
    database_url: str = "data/splitwise.db"
    frontend_dist: str = "frontend/dist"
    allowed_origins: list[str] = ["*"]

    class Config:
        env_file = ".env"


settings = Settings()
