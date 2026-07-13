import json

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.strategies.models import Strategy
from .models import ScreenerUniverse, ScreenerRun
from .serializers import (
    ScreenerUniverseSerializer,
    ScreenerUniverseCreateSerializer,
    ScreenerUniverseUpdateSerializer,
    ScreenerRunListSerializer,
    ScreenerRunDetailSerializer,
    ScreenerRunStatusSerializer,
    ScreenerCreateSerializer,
)
from .default_universe import DEFAULT_UNIVERSE_SYMBOLS

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
            "Screening is only supported for strategies generated with the structured IR. "
            "Regenerate this strategy's config to enable it."
        )
    return config, None


class UniverseListCreateView(APIView):
    def get(self, request):
        if not ScreenerUniverse.objects.exists():
            ScreenerUniverse.objects.create(
                name="NSE Mid/Small Cap — Starter List",
                symbols=DEFAULT_UNIVERSE_SYMBOLS,
                description=(
                    "Example universe shipped with the screener — not a verified, current "
                    "NSE F&O-eligible list. Edit or replace it with your own symbols before "
                    "relying on results."
                ),
                is_default=True,
            )
        universes = ScreenerUniverse.objects.all()
        return ok(ScreenerUniverseSerializer(universes, many=True).data)

    def post(self, request):
        serializer = ScreenerUniverseCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return err(str(serializer.errors))
        universe = ScreenerUniverse.objects.create(**serializer.validated_data)
        return Response(
            {"success": True, "data": ScreenerUniverseSerializer(universe).data, "error": None},
            status=status.HTTP_201_CREATED,
        )


class UniverseDetailView(APIView):
    def _get(self, pk):
        try:
            return ScreenerUniverse.objects.get(pk=pk)
        except ScreenerUniverse.DoesNotExist:
            return None

    def patch(self, request, pk):
        universe = self._get(pk)
        if not universe:
            return err("Universe not found", status.HTTP_404_NOT_FOUND)
        serializer = ScreenerUniverseUpdateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return err(str(serializer.errors))
        for field, value in serializer.validated_data.items():
            setattr(universe, field, value)
        universe.save()
        return ok(ScreenerUniverseSerializer(universe).data)

    def delete(self, request, pk):
        universe = self._get(pk)
        if not universe:
            return err("Universe not found", status.HTTP_404_NOT_FOUND)
        universe.delete()
        return ok({"deleted": True})


class ScreenerRunListCreateView(APIView):
    def get(self, request):
        runs = ScreenerRun.objects.select_related("strategy", "universe").all()
        return ok(ScreenerRunListSerializer(runs, many=True).data)

    def post(self, request):
        serializer = ScreenerCreateSerializer(data=request.data)
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
            return err("No symbols to scan")
        if len(symbols) > MAX_SYMBOLS_PER_RUN:
            return err(f"{len(symbols)} symbols requested, exceeding the limit of {MAX_SYMBOLS_PER_RUN} per run.")

        run = ScreenerRun.objects.create(
            strategy=strategy,
            universe=universe,
            symbols=symbols,
            timeframe=data["timeframe"],
            as_of_date=data["as_of_date"],
            lookback_days=data["lookback_days"],
            base_config=config,
            status="queued",
        )

        from .tasks import run_screener_task
        run_screener_task.delay(str(run.id))

        return Response(
            {"success": True, "data": ScreenerRunDetailSerializer(run).data, "error": None},
            status=status.HTTP_201_CREATED,
        )


class ScreenerRunDetailView(APIView):
    def _get_run(self, pk):
        try:
            return ScreenerRun.objects.get(pk=pk)
        except ScreenerRun.DoesNotExist:
            return None

    def get(self, request, pk):
        run = self._get_run(pk)
        if not run:
            return err("ScreenerRun not found", status.HTTP_404_NOT_FOUND)
        return ok(ScreenerRunDetailSerializer(run).data)

    def delete(self, request, pk):
        run = self._get_run(pk)
        if not run:
            return err("ScreenerRun not found", status.HTTP_404_NOT_FOUND)
        run.delete()
        return ok({"deleted": True})


class ScreenerRunStatusView(APIView):
    def get(self, request, pk):
        try:
            run = ScreenerRun.objects.get(pk=pk)
        except ScreenerRun.DoesNotExist:
            return err("ScreenerRun not found", status.HTTP_404_NOT_FOUND)
        return ok(ScreenerRunStatusSerializer(run).data)
