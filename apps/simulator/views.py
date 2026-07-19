import json

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.strategies.models import Strategy
from apps.screener.models import ScreenerUniverse
from .models import SimulatorRun
from .serializers import (
    SimulatorRunListSerializer,
    SimulatorRunDetailSerializer,
    SimulatorRunStatusSerializer,
    SimulatorCreateSerializer,
)

MAX_SYMBOLS_PER_RUN = 750


def ok(data):
    return Response({"success": True, "data": data, "error": None})


def err(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "data": None, "error": message}, status=code)


def _load_ir_config(strategy):
    if not strategy.backtest_script:
        return None, "Strategy has no generated config yet."
    try:
        config = json.loads(strategy.backtest_script)
    except json.JSONDecodeError:
        return None, "Strategy config is not valid JSON."
    if not (isinstance(config, dict) and "entries" in config and "indicators" in config):
        return None, (
            "The simulator is only supported for strategies generated with the structured IR. "
            "Regenerate this strategy's config to enable it."
        )
    return config, None


class SimulatorRunListCreateView(APIView):
    def get(self, request):
        runs = SimulatorRun.objects.select_related("strategy", "universe").all()
        return ok(SimulatorRunListSerializer(runs, many=True).data)

    def post(self, request):
        serializer = SimulatorCreateSerializer(data=request.data)
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

        universe = None
        if data.get("universe_id"):
            try:
                universe = ScreenerUniverse.objects.get(pk=data["universe_id"])
            except ScreenerUniverse.DoesNotExist:
                return err("Universe not found", status.HTTP_404_NOT_FOUND)
            symbols = universe.symbols
        else:
            symbols = data["symbols"]

        if not symbols:
            return err("No symbols to simulate")
        if len(symbols) > MAX_SYMBOLS_PER_RUN:
            return err(f"{len(symbols)} symbols requested, exceeding the limit of {MAX_SYMBOLS_PER_RUN} per run.")

        run = SimulatorRun.objects.create(
            strategy=strategy,
            universe=universe,
            symbols=symbols,
            base_config=config,
            initial_capital=data["initial_capital"],
            risk_pct=data["risk_pct"],
            commission_pct=data["commission_pct"],
            slippage_pct=data["slippage_pct"],
            timeframe=data["timeframe"],
            start_date=data["start_date"],
            end_date=data["end_date"],
            status="queued",
        )

        from .tasks import run_simulator_task
        run_simulator_task.delay(str(run.id))

        return Response(
            {"success": True, "data": SimulatorRunDetailSerializer(run).data, "error": None},
            status=status.HTTP_201_CREATED,
        )


class SimulatorRunDetailView(APIView):
    def _get_run(self, pk):
        try:
            return SimulatorRun.objects.get(pk=pk)
        except SimulatorRun.DoesNotExist:
            return None

    def get(self, request, pk):
        run = self._get_run(pk)
        if not run:
            return err("SimulatorRun not found", status.HTTP_404_NOT_FOUND)
        return ok(SimulatorRunDetailSerializer(run).data)

    def delete(self, request, pk):
        run = self._get_run(pk)
        if not run:
            return err("SimulatorRun not found", status.HTTP_404_NOT_FOUND)
        run.delete()
        return ok({"deleted": True})


class SimulatorRunStatusView(APIView):
    def get(self, request, pk):
        try:
            run = SimulatorRun.objects.get(pk=pk)
        except SimulatorRun.DoesNotExist:
            return err("SimulatorRun not found", status.HTTP_404_NOT_FOUND)
        return ok(SimulatorRunStatusSerializer(run).data)
