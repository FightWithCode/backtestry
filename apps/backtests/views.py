from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.strategies.models import Strategy
from .models import BacktestRun
from .serializers import (
    BacktestRunListSerializer,
    BacktestRunDetailSerializer,
    BacktestRunStatusSerializer,
    BacktestCreateSerializer,
)


def ok(data):
    return Response({"success": True, "data": data, "error": None})


def err(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "data": None, "error": message}, status=code)


class BacktestListCreateView(APIView):
    def get(self, request):
        runs = BacktestRun.objects.select_related("strategy").all()
        return ok(BacktestRunListSerializer(runs, many=True).data)

    def post(self, request):
        serializer = BacktestCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return err(str(serializer.errors))

        data = serializer.validated_data

        try:
            strategy = Strategy.objects.get(pk=data["strategy_id"])
        except Strategy.DoesNotExist:
            return err("Strategy not found", status.HTTP_404_NOT_FOUND)

        if strategy.script_status != "generated":
            return err("Strategy script is not yet generated. Current status: " + strategy.script_status)

        run = BacktestRun.objects.create(
            strategy=strategy,
            symbols=data["symbols"],
            start_date=data["start_date"],
            end_date=data["end_date"],
            initial_capital=data["initial_capital"],
            commission_pct=data["commission_pct"],
            slippage_pct=data["slippage_pct"],
            timeframe=data["timeframe"],
            script_version_used=strategy.script_version,
            status="queued",
        )

        from .tasks import run_backtest_task
        run_backtest_task.delay(str(run.id))

        return Response(
            {"success": True, "data": BacktestRunDetailSerializer(run).data, "error": None},
            status=status.HTTP_201_CREATED,
        )


class BacktestDetailView(APIView):
    def _get_run(self, pk):
        try:
            return BacktestRun.objects.get(pk=pk)
        except BacktestRun.DoesNotExist:
            return None

    def get(self, request, pk):
        run = self._get_run(pk)
        if not run:
            return err("BacktestRun not found", status.HTTP_404_NOT_FOUND)
        return ok(BacktestRunDetailSerializer(run).data)

    def delete(self, request, pk):
        run = self._get_run(pk)
        if not run:
            return err("BacktestRun not found", status.HTTP_404_NOT_FOUND)
        run.delete()
        return ok({"deleted": True})


class BacktestStatusView(APIView):
    def get(self, request, pk):
        try:
            run = BacktestRun.objects.get(pk=pk)
        except BacktestRun.DoesNotExist:
            return err("BacktestRun not found", status.HTTP_404_NOT_FOUND)
        return ok(BacktestRunStatusSerializer(run).data)
