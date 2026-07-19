from rest_framework import serializers
from .models import AppSettings


class AppSettingsSerializer(serializers.ModelSerializer):
    upstox_access_token_set = serializers.SerializerMethodField()
    effective_data_provider = serializers.SerializerMethodField()

    class Meta:
        model = AppSettings
        fields = [
            "data_provider", "effective_data_provider",
            "upstox_access_token", "upstox_access_token_set", "updated_at",
        ]
        extra_kwargs = {
            "upstox_access_token": {"write_only": True, "required": False, "allow_blank": True},
        }

    def get_upstox_access_token_set(self, obj):
        from .models import get_upstox_access_token
        return bool(get_upstox_access_token())

    def get_effective_data_provider(self, obj):
        """`data_provider` can be blank (falls back to the DATA_PROVIDER env var) —
        this resolves what's actually in effect right now, which is what callers
        deciding whether to append ".NS" for yfinance actually need."""
        from .models import get_data_provider
        return get_data_provider()
