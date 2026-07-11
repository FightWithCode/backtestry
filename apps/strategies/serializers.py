from rest_framework import serializers
from .models import Strategy, StrategyScriptHistory


class BacktestRunBriefSerializer(serializers.Serializer):
    """Minimal backtest run data embedded in strategy detail."""
    id = serializers.UUIDField()
    symbols = serializers.JSONField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()


class StrategyScriptHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = StrategyScriptHistory
        fields = ["id", "version", "reason", "generated_at", "script"]


class StrategyListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Strategy
        fields = [
            "id", "name", "source_url", "source_type", "description",
            "indicators", "candle_patterns", "timeframe",
            "script_status", "script_version", "created_at", "updated_at",
        ]


class StrategyDetailSerializer(serializers.ModelSerializer):
    backtests = serializers.SerializerMethodField()

    def get_backtests(self, obj):
        from apps.backtests.models import BacktestRun
        runs = BacktestRun.objects.filter(strategy=obj).order_by('-created_at')[:5]
        return [
            {
                "id": str(r.id),
                "symbols": r.symbols,
                "start_date": str(r.start_date),
                "end_date": str(r.end_date),
                "status": r.status,
                "created_at": r.created_at.isoformat(),
            }
            for r in runs
        ]

    class Meta:
        model = Strategy
        fields = [
            "id", "name", "source_url", "source_type", "description",
            "step_wise_process", "entry_rules", "exit_rules",
            "indicators", "candle_patterns", "timeframe",
            "backtest_script", "script_version", "script_generated_at",
            "script_status", "script_error", "created_at", "updated_at",
            "backtests",
        ]


class StrategyStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Strategy
        fields = ["id", "script_status", "script_error", "script_version"]


class StrategyCreateSerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(choices=["youtube", "webpage", "keyword", "text"])
    source_url = serializers.URLField(required=False, allow_blank=True)
    keywords = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        source_type = data.get("source_type")
        if source_type in ("youtube", "webpage") and not data.get("source_url"):
            raise serializers.ValidationError(
                "source_url is required for youtube and webpage source types."
            )
        if source_type in ("keyword", "text") and not data.get("keywords"):
            raise serializers.ValidationError(
                f"keywords is required for {source_type} source type."
            )
        return data
