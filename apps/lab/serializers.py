from rest_framework import serializers
from .models import LabRun, LabVariant, LabResult


class LabResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabResult
        fields = [
            "id", "symbol",
            "total_trades", "winning_trades", "losing_trades",
            "win_rate", "total_return_pct", "max_drawdown_pct",
            "sharpe_ratio", "profit_factor", "avg_trade_return_pct",
            "best_trade_pct", "worst_trade_pct",
            "equity_curve", "drawdown_series", "trade_log", "chart_data", "extra_metrics",
        ]


class LabVariantSerializer(serializers.ModelSerializer):
    results = LabResultSerializer(many=True, read_only=True)

    class Meta:
        model = LabVariant
        fields = ["id", "index", "label", "overrides", "resolved_config", "results"]


class LabRunListSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source="strategy.name", read_only=True)

    class Meta:
        model = LabRun
        fields = [
            "id", "strategy", "strategy_name", "name",
            "symbols", "start_date", "end_date", "initial_capital",
            "commission_pct", "slippage_pct", "timeframe",
            "variant_count", "status", "error",
            "created_at", "completed_at",
        ]


class LabRunDetailSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source="strategy.name", read_only=True)
    variants = LabVariantSerializer(many=True, read_only=True)

    class Meta:
        model = LabRun
        fields = [
            "id", "strategy", "strategy_name", "name",
            "symbols", "start_date", "end_date", "initial_capital",
            "commission_pct", "slippage_pct", "timeframe",
            "overrides_spec", "variant_count", "status", "error",
            "created_at", "completed_at", "variants",
        ]


class LabRunStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabRun
        fields = ["id", "status", "completed_at", "error", "variant_count"]


class LabCreateSerializer(serializers.Serializer):
    strategy_id = serializers.UUIDField()
    name = serializers.CharField(required=False, allow_blank=True, default="")
    symbols = serializers.ListField(child=serializers.CharField(), min_length=1)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    initial_capital = serializers.FloatField(default=100000, min_value=1)
    commission_pct = serializers.FloatField(default=0.0, min_value=0)
    slippage_pct = serializers.FloatField(default=0.0, min_value=0)
    timeframe = serializers.CharField(required=False, allow_blank=True, default="")
    overrides = serializers.DictField(child=serializers.ListField(), required=False, default=dict)

    def validate_symbols(self, value):
        result, seen = [], set()
        for item in value:
            for sym in item.split(","):
                sym = sym.strip().upper()
                if sym and sym not in seen:
                    result.append(sym)
                    seen.add(sym)
        if not result:
            raise serializers.ValidationError("At least one valid symbol is required.")
        if len(result) > 25:
            raise serializers.ValidationError("Maximum 25 symbols per lab run.")
        return result

    def validate_timeframe(self, value):
        if not value:
            return value
        from apps.strategies.timeframe import TIMEFRAME_MAP
        if value.lower().strip() not in TIMEFRAME_MAP:
            raise serializers.ValidationError(
                f"Unrecognized timeframe '{value}'. Use one of: {sorted(set(TIMEFRAME_MAP.values()))}"
            )
        return value

    def validate_overrides(self, value):
        for path, values in value.items():
            if not values or not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
                raise serializers.ValidationError(f"'{path}': each value must be a non-empty list of numbers.")
        return value

    def validate(self, data):
        if data["start_date"] >= data["end_date"]:
            raise serializers.ValidationError("end_date must be after start_date")
        return data
