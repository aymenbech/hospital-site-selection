from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Hospital Site Selection API"
    app_version: str = "1.0.0"

    database_url: str

    supabase_url: str
    supabase_key: str
    supabase_service_role_key: str
    supabase_storage_bucket: str = "datasets"

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()