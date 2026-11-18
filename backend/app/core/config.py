from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "DISCOUNT AI API"
    environment: str = "development"
    secret_key: str = "dev-only-change-me-in-production"
    access_token_expire_minutes: int = 60 * 24
    database_url: str = "sqlite:///./discount_ai.db"
    demo_mode: bool = True
    seed_demo_data: bool = True

    frontend_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"

    ai_provider: str = "fallback"
    ai_api_key: str = ""
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"

    telegram_bot_token: str = ""
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    email_provider: str = "console"
    smtp_url: str = ""

    payment_provider: str = "sandbox"
    rate_limit_per_minute: int = 120

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
