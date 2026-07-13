import json

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.strategies.models import Strategy
from .models import LabRun, LabVariant
from .serializers import (
    LabRunListSerializer,
    LabRunDetailSerializer,
    LabRunStatusSerializer,
    LabCreateSerializer,
)
from .config_tools import extract_tunables, generate_variants

MAX_VARIANTS = 60
# Bounds variants * symbols — each combination runs synchronously (Celery is
# eager in DEBUG), so this keeps a single request from blocking for minutes.
MAX_TOTAL_RUNS = 400


def ok(data):
    return Response({"success": True, "data": data, "error": None})


def err(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "data": None, "error": message}, status=code)


def _load_ir_config(strategy):
    """Returns (config, error_message). error_message is None on success."""
    if not strategy.backtest_script:
        return None, "Strategy has no generated config yet."
    try:
        config = json.loads(strategy.backtest_script)
    except json.JSONDecodeError:
        return None, "Strategy config is not valid JSON."
    if not (isinstance(config, dict) and "entries" in config and "indicators" in config):
        return None, (
            "Parameter sweeps are only supported for strategies generated with the "
            "structured IR. Regenerate this strategy's config to enable it."
        )
    return config, None


class TunablesView(APIView):
    def get(self, request, pk):
        try:
            strategy = Strategy.objects.get(pk=pk)
        except Strategy.DoesNotExist:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)

        config, error = _load_ir_config(strategy)
        if error:
            return err(error)

        return ok({"tunables": extract_tunables(config), "config": config})


class LabRunListCreateView(APIView):
    def get(self, request):
        runs = LabRun.objects.select_related("strategy").all()
        return ok(LabRunListSerializer(runs, many=True).data)

    def post(self, request):
        serializer = LabCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return err(str(serializer.errors))
        data = serializer.validated_data

        try:
            strategy = Strategy.objects.get(pk=data["strategy_id"])
        except Strategy.DoesNotExist:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)

        if strategy.script_status != "generated":
            return err("Strategy script is not yet generated. Current status: " + strategy.script_status)

        config, error = _load_ir_config(strategy)
        if error:
            return err(error)

        try:
            variants = generate_variants(config, data["overrides"] or {}, max_variants=MAX_VARIANTS)
        except ValueError as e:
            return err(str(e))

        total_runs = len(variants) * len(data["symbols"])
        if total_runs > MAX_TOTAL_RUNS:
            return err(
                f"This sweep would run {total_runs} backtests ({len(variants)} variants x "
                f"{len(data['symbols'])} symbols), exceeding the limit of {MAX_TOTAL_RUNS}. "
                f"Reduce symbols or parameter combinations."
            )

        run = LabRun.objects.create(
            strategy=strategy,
            name=data["name"],
            symbols=data["symbols"],
            start_date=data["start_date"],
            end_date=data["end_date"],
            initial_capital=data["initial_capital"],
            commission_pct=data["commission_pct"],
            slippage_pct=data["slippage_pct"],
            timeframe=data["timeframe"],
            base_config=config,
            overrides_spec=data["overrides"] or {},
            variant_count=len(variants),
            status="queued",
        )

        LabVariant.objects.bulk_create([
            LabVariant(run=run, index=i, label=v["label"], overrides=v["overrides"], resolved_config=v["config"])
            for i, v in enumerate(variants)
        ])

        from .tasks import run_lab_task
        run_lab_task.delay(str(run.id))

        return Response(
            {"success": True, "data": LabRunDetailSerializer(run).data, "error": None},
            status=status.HTTP_201_CREATED,
        )


class LabRunDetailView(APIView):
    def _get_run(self, pk):
        try:
            return LabRun.objects.get(pk=pk)
        except LabRun.DoesNotExist:
            return None

    def get(self, request, pk):
        run = self._get_run(pk)
        if not run:
            return err("LabRun not found", status.HTTP_404_NOT_FOUND)
        return ok(LabRunDetailSerializer(run).data)

    def delete(self, request, pk):
        run = self._get_run(pk)
        if not run:
            return err("LabRun not found", status.HTTP_404_NOT_FOUND)
        run.delete()
        return ok({"deleted": True})


class LabRunStatusView(APIView):
    def get(self, request, pk):
        try:
            run = LabRun.objects.get(pk=pk)
        except LabRun.DoesNotExist:
            return err("LabRun not found", status.HTTP_404_NOT_FOUND)
        return ok(LabRunStatusSerializer(run).data)
