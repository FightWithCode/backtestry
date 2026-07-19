from rest_framework import serializers
from django.utils import timezone

from .models import ScreenerUniverse, ScreenerRun, ScreenerSignal
from .utils import normalize_symbols


class ScreenerUniverseSerializer(serializers.ModelSerializer):
    symbol_count = serializers.SerializerMethodField()

    class Meta:
        model = ScreenerUniverse
        fields = ["id", "name", "symbols", "symbol_count", "description", "sector", "group_type", "is_default", "created_at", "updated_at"]

    def get_symbol_count(self, obj):
        return len(obj.symbols or [])


class ScreenerUniverseCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    symbols = serializers.ListField(child=serializers.CharField())
    description = serializers.CharField(required=False, allow_blank=True, default="")
    sector = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")

    def validate_symbols(self, value):
        normalized = normalize_symbols(value)
        if not normalized:
            raise serializers.ValidationError("At least one symbol is required.")
        return normalized


class ScreenerUniverseUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    symbols = serializers.ListField(child=serializers.CharField(), required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    sector = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_symbols(self, value):
        normalized = normalize_symbols(value)
        if not normalized:
            raise serializers.ValidationError("At least one symbol is required.")
        return normalized


class ScreenerSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScreenerSignal
        fields = [
            "id", "symbol", "direction", "as_of_date", "entry_price", "entry_tag",
            "exit_plan", "indicator_snapshot", "rule_explanation", "bar",
        ]


class ScreenerRunListSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source="strategy.name", read_only=True)
    universe_name = serializers.CharField(source="universe.name", read_only=True, default=None)
    symbol_count = serializers.SerializerMethodField()

    class Meta:
        model = ScreenerRun
        fields = [
            "id", "strategy", "strategy_name", "universe", "universe_name", "symbol_count",
            "timeframe", "as_of_date", "lookback_days", "status", "error",
            "symbols_scanned", "symbols_failed", "signals_found",
            "created_at", "completed_at",
        ]

    def get_symbol_count(self, obj):
        return len(obj.symbols or [])


class ScreenerRunDetailSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source="strategy.name", read_only=True)
    universe_name = serializers.CharField(source="universe.name", read_only=True, default=None)
    symbol_count = serializers.SerializerMethodField()
    signals = ScreenerSignalSerializer(many=True, read_only=True)

    class Meta:
        model = ScreenerRun
        fields = [
            "id", "strategy", "strategy_name", "universe", "universe_name", "symbols", "symbol_count",
            "timeframe", "as_of_date", "lookback_days", "status", "error",
            "symbols_scanned", "symbols_failed", "signals_found",
            "created_at", "completed_at", "signals",
        ]

    def get_symbol_count(self, obj):
        return len(obj.symbols or [])


class ScreenerRunStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScreenerRun
        fields = ["id", "status", "completed_at", "error", "symbols_scanned", "signals_found"]


class ScreenerCreateSerializer(serializers.Serializer):
    strategy_id = serializers.UUIDField()
    universe_id = serializers.UUIDField(required=False, allow_null=True)
    symbols = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    timeframe = serializers.CharField(required=False, allow_blank=True, default="")
    as_of_date = serializers.DateField(required=False)
    lookback_days = serializers.IntegerField(default=400, min_value=60, max_value=1500)

    def validate_timeframe(self, value):
        if not value:
            return value
        from apps.strategies.timeframe import TIMEFRAME_MAP
        if value.lower().strip() not in TIMEFRAME_MAP:
            raise serializers.ValidationError(
                f"Unrecognized timeframe '{value}'. Use one of: {sorted(set(TIMEFRAME_MAP.values()))}"
            )
        return value

    def validate_symbols(self, value):
        return normalize_symbols(value)

    def validate(self, data):
        if not data.get("universe_id") and not data.get("symbols"):
            raise serializers.ValidationError("Provide either universe_id or a symbols list.")
        if not data.get("as_of_date"):
            data["as_of_date"] = timezone.localdate()
        return data
