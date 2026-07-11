from rest_framework import serializers
from .models import BacktestRun, BacktestResult


class BacktestResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = BacktestResult
        fields = [
            "id", "symbol",
            "total_trades", "winning_trades", "losing_trades",
            "win_rate", "total_return_pct", "max_drawdown_pct",
            "sharpe_ratio", "profit_factor", "avg_trade_return_pct",
            "best_trade_pct", "worst_trade_pct",
            "equity_curve", "drawdown_series", "trade_log", "signal_coverage", "chart_data",
        ]


class BacktestRunListSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source="strategy.name", read_only=True)

    class Meta:
        model = BacktestRun
        fields = [
            "id", "strategy", "strategy_name",
            "symbols", "start_date", "end_date", "initial_capital",
            "commission_pct", "slippage_pct",
            "script_version_used", "status", "error",
            "created_at", "completed_at",
        ]


class BacktestRunDetailSerializer(serializers.ModelSerializer):
    results = BacktestResultSerializer(many=True, read_only=True)
    strategy_name = serializers.CharField(source="strategy.name", read_only=True)

    class Meta:
        model = BacktestRun
        fields = [
            "id", "strategy", "strategy_name",
            "symbols", "start_date", "end_date", "initial_capital",
            "commission_pct", "slippage_pct",
            "script_version_used", "status", "error",
            "created_at", "completed_at", "results",
        ]


class BacktestRunStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = BacktestRun
        fields = ["id", "status", "completed_at", "error"]


class BacktestCreateSerializer(serializers.Serializer):
    strategy_id = serializers.UUIDField()
    symbols = serializers.ListField(child=serializers.CharField(), min_length=1)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    initial_capital = serializers.FloatField(default=100000, min_value=1)
    commission_pct = serializers.FloatField(default=0.0, min_value=0)
    slippage_pct = serializers.FloatField(default=0.0, min_value=0)

    def validate_symbols(self, value):
        """
        Accept both a plain list and comma-separated strings inside the list.
        ["AAPL, MSFT, GOOGL"] and ["AAPL", "MSFT", "GOOGL"] both produce
        ["AAPL", "MSFT", "GOOGL"]. Symbols are uppercased and deduplicated
        while preserving order.
        """
        result = []
        seen = set()
        for item in value:
            for sym in item.split(","):
                sym = sym.strip().upper()
                if sym and sym not in seen:
                    result.append(sym)
                    seen.add(sym)
        if not result:
            raise serializers.ValidationError("At least one valid symbol is required.")
        return result

    def validate(self, data):
        if data["start_date"] >= data["end_date"]:
            raise serializers.ValidationError("end_date must be after start_date")
        return data
