from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import Strategy, StrategyScriptHistory
from .serializers import (
    StrategyListSerializer,
    StrategyDetailSerializer,
    StrategyStatusSerializer,
    StrategyScriptHistorySerializer,
    StrategyCreateSerializer,
    StrategyUpdateSerializer,
)


def ok(data):
    return Response({"success": True, "data": data, "error": None})


def err(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "data": None, "error": message}, status=code)


class StrategyListCreateView(APIView):
    def get(self, request):
        strategies = Strategy.objects.all()
        serializer = StrategyListSerializer(strategies, many=True)
        return ok(serializer.data)

    def post(self, request):
        serializer = StrategyCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return err(str(serializer.errors))

        data = serializer.validated_data
        source_type = data["source_type"]
        source_url = data.get("source_url", "")
        keywords = data.get("keywords", "")

        strategy = Strategy.objects.create(
            name="Generating...",
            source_url=source_url if source_type in ("youtube", "webpage") else None,
            source_type=source_type,
            description="",
            timeframe="1d",
            script_status="pending",
        )

        from .tasks import scrape_and_generate_script
        input_value = source_url if source_type in ("youtube", "webpage") else keywords
        scrape_and_generate_script.delay(str(strategy.id), source_type, input_value)
        # "text" source type carries raw pasted content (e.g. a Pine script) via `keywords`,
        # same payload field as "keyword" — no new field needed on the wire.

        return Response(
            {"success": True, "data": StrategyDetailSerializer(strategy).data, "error": None},
            status=status.HTTP_201_CREATED,
        )


class StrategyDetailView(APIView):
    def _get_strategy(self, pk):
        try:
            return Strategy.objects.get(pk=pk)
        except Strategy.DoesNotExist:
            return None

    def get(self, request, pk):
        strategy = self._get_strategy(pk)
        if not strategy:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)
        return ok(StrategyDetailSerializer(strategy).data)

    def patch(self, request, pk):
        strategy = self._get_strategy(pk)
        if not strategy:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)
        serializer = StrategyUpdateSerializer(strategy, data=request.data, partial=True)
        if not serializer.is_valid():
            return err(str(serializer.errors))
        serializer.save()
        return ok(StrategyDetailSerializer(strategy).data)

    def delete(self, request, pk):
        strategy = self._get_strategy(pk)
        if not strategy:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)
        strategy.delete()
        return ok({"deleted": True})


class StrategyStatusView(APIView):
    def get(self, request, pk):
        try:
            strategy = Strategy.objects.get(pk=pk)
        except Strategy.DoesNotExist:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)
        return ok(StrategyStatusSerializer(strategy).data)


class RegenerateScriptView(APIView):
    def post(self, request, pk):
        try:
            strategy = Strategy.objects.get(pk=pk)
        except Strategy.DoesNotExist:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)

        if strategy.script_status == "generating":
            return err("Script generation already in progress")

        from .tasks import regenerate_script_task
        regenerate_script_task.delay(str(strategy.id))

        strategy.script_status = "generating"
        strategy.save(update_fields=["script_status"])

        return ok({"message": "Script regeneration started", "id": str(strategy.id)})


class UpdateConfigView(APIView):
    """Manually overwrite a strategy's backtest config (IR JSON or legacy)."""

    def post(self, request, pk):
        try:
            strategy = Strategy.objects.get(pk=pk)
        except Strategy.DoesNotExist:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)

        raw = request.data.get("backtest_script")
        if not raw or not isinstance(raw, str):
            return err("backtest_script (a JSON string) is required")

        import json
        try:
            config = json.loads(raw)
        except json.JSONDecodeError as exc:
            return err(f"Invalid JSON: {exc}")

        if isinstance(config, dict) and "entries" in config and "indicators" in config:
            from .ir.validate import validate_ir
            errors = validate_ir(config)
            if errors:
                return err("Invalid strategy config: " + "; ".join(errors))

        config_text = json.dumps(config)

        from django.utils import timezone
        if strategy.backtest_script:
            StrategyScriptHistory.objects.create(
                strategy=strategy,
                script=strategy.backtest_script,
                version=strategy.script_version,
                reason="manual_edit",
            )

        strategy.backtest_script = config_text
        strategy.script_version += 1
        strategy.script_generated_at = timezone.now()
        strategy.script_status = "generated"
        strategy.script_error = None
        strategy.save(
            update_fields=[
                "backtest_script", "script_version",
                "script_generated_at", "script_status", "script_error",
            ]
        )

        StrategyScriptHistory.objects.create(
            strategy=strategy,
            script=config_text,
            version=strategy.script_version,
            reason="manual_edit",
        )

        return ok(StrategyDetailSerializer(strategy).data)


class ScriptHistoryView(APIView):
    def get(self, request, pk):
        try:
            strategy = Strategy.objects.get(pk=pk)
        except Strategy.DoesNotExist:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)

        history = strategy.script_history.all()
        serializer = StrategyScriptHistorySerializer(history, many=True)
        return ok(serializer.data)
