from rest_framework import serializers
from .models import SimulatorRun


class SimulatorRunListSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source="strategy.name", read_only=True)
    universe_name = serializers.CharField(source="universe.name", read_only=True, default=None)
    symbol_count = serializers.SerializerMethodField()

    class Meta:
        model = SimulatorRun
        fields = [
            "id", "strategy", "strategy_name", "universe", "universe_name", "symbol_count",
            "initial_capital", "risk_pct", "commission_pct", "slippage_pct", "timeframe",
            "start_date", "end_date", "status", "error",
            "symbols_fetched", "symbols_failed", "symbols_traded",
            "final_capital", "total_return_pct", "total_trades", "win_rate", "sharpe_ratio",
            "created_at", "completed_at",
        ]

    def get_symbol_count(self, obj):
        return len(obj.symbols or [])


class SimulatorRunDetailSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source="strategy.name", read_only=True)
    universe_name = serializers.CharField(source="universe.name", read_only=True, default=None)
    symbol_count = serializers.SerializerMethodField()

    class Meta:
        model = SimulatorRun
        fields = [
            "id", "strategy", "strategy_name", "universe", "universe_name", "symbols", "symbol_count",
            "initial_capital", "risk_pct", "commission_pct", "slippage_pct", "timeframe",
            "start_date", "end_date", "status", "error",
            "symbols_fetched", "symbols_failed", "symbols_traded",
            "final_capital", "total_trades", "winning_trades", "losing_trades", "win_rate",
            "total_return_pct", "annualized_return_pct", "max_drawdown_pct",
            "sharpe_ratio", "sortino_ratio", "calmar_ratio", "profit_factor",
            "avg_trade_return_pct", "best_trade_pct", "worst_trade_pct",
            "avg_win_pct", "avg_loss_pct", "risk_reward_ratio", "avg_trade_duration_days",
            "equity_curve", "drawdown_series", "trade_log", "monthly_returns",
            "created_at", "completed_at",
        ]

    def get_symbol_count(self, obj):
        return len(obj.symbols or [])


class SimulatorRunStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulatorRun
        fields = ["id", "status", "completed_at", "error", "symbols_fetched", "total_trades"]


class SimulatorCreateSerializer(serializers.Serializer):
    strategy_id = serializers.UUIDField()
    universe_id = serializers.UUIDField(required=False, allow_null=True)
    symbols = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    initial_capital = serializers.FloatField(default=100000, min_value=1)
    risk_pct = serializers.FloatField(default=2.0, min_value=0.1, max_value=100)
    commission_pct = serializers.FloatField(default=0.0, min_value=0)
    slippage_pct = serializers.FloatField(default=0.0, min_value=0)
    timeframe = serializers.CharField(required=False, allow_blank=True, default="")
    start_date = serializers.DateField()
    end_date = serializers.DateField()

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
        from apps.screener.utils import normalize_symbols
        return normalize_symbols(value)

    def validate(self, data):
        if not data.get("universe_id") and not data.get("symbols"):
            raise serializers.ValidationError("Provide either universe_id or a symbols list.")
        if data["start_date"] >= data["end_date"]:
            raise serializers.ValidationError("end_date must be after start_date")
        return data
