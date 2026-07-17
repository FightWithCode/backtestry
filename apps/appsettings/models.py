from django.conf import settings
from django.db import models


class AppSettings(models.Model):
    """
    Singleton (always pk=1) holding runtime-editable settings that would
    otherwise require a server restart via .env — currently just the OHLCV
    data provider. Falls back to the DATA_PROVIDER / UPSTOX_ACCESS_TOKEN env
    vars (see config/settings.py) until someone changes it via the API/UI.
    """
    DATA_PROVIDERS = [
        ("yfinance", "yfinance"),
        ("upstox", "Upstox"),
    ]

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    data_provider = models.CharField(max_length=20, choices=DATA_PROVIDERS, blank=True, default="")
    upstox_access_token = models.CharField(max_length=1024, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass  # singleton — never actually deleted

    @classmethod
    def load(cls) -> "AppSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"AppSettings(data_provider={self.data_provider or 'unset'})"


def get_data_provider() -> str:
    """DB value wins when set (i.e. someone changed it via the API/UI without
    restarting); otherwise falls back to the DATA_PROVIDER env var."""
    db_value = AppSettings.load().data_provider
    return db_value or getattr(settings, "DATA_PROVIDER", "") or "yfinance"


def get_upstox_access_token() -> str:
    db_value = AppSettings.load().upstox_access_token
    return db_value or getattr(settings, "UPSTOX_ACCESS_TOKEN", "")
