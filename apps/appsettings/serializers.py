from rest_framework import serializers
from .models import AppSettings


class AppSettingsSerializer(serializers.ModelSerializer):
    upstox_access_token_set = serializers.SerializerMethodField()

    class Meta:
        model = AppSettings
        fields = ["data_provider", "upstox_access_token", "upstox_access_token_set", "updated_at"]
        extra_kwargs = {
            "upstox_access_token": {"write_only": True, "required": False, "allow_blank": True},
        }

    def get_upstox_access_token_set(self, obj):
        from .models import get_upstox_access_token
        return bool(get_upstox_access_token())
