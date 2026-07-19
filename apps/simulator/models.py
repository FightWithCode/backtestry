import uuid
from django.db import models
from apps.strategies.models import Strategy
from apps.screener.models import ScreenerUniverse


class SimulatorRun(models.Model):
    STATUS = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE, related_name="simulator_runs")
    universe = models.ForeignKey(ScreenerUniverse, on_delete=models.SET_NULL, null=True, blank=True, related_name="simulator_runs")

    # Snapshots — a run's meaning shouldn't change if the universe is edited
    # or the strategy regenerated afterward (same rationale as apps/lab, apps/screener).
    symbols = models.JSONField(default=list)
    base_config = models.JSONField()

    initial_capital = models.FloatField(default=100000)
    risk_pct = models.FloatField(default=2.0)
    commission_pct = models.FloatField(default=0.0)
    slippage_pct = models.FloatField(default=0.0)
    timeframe = models.CharField(max_length=10, blank=True, default="")
    start_date = models.DateField()
    end_date = models.DateField()

    status = models.CharField(max_length=20, choices=STATUS, default="queued")
    error = models.TextField(null=True, blank=True)
    symbols_fetched = models.IntegerField(default=0)
    symbols_failed = models.JSONField(default=list)
    symbols_traded = models.JSONField(default=list)

    # Result — one simulation produces one combined trade log/equity curve,
    # not per-symbol like Backtest/Lab, so these live directly on the run.
    final_capital = models.FloatField(default=0)
    total_trades = models.IntegerField(default=0)
    winning_trades = models.IntegerField(default=0)
    losing_trades = models.IntegerField(default=0)
    win_rate = models.FloatField(default=0)
    total_return_pct = models.FloatField(default=0)
    annualized_return_pct = models.FloatField(default=0)
    max_drawdown_pct = models.FloatField(default=0)
    sharpe_ratio = models.FloatField(default=0)
    sortino_ratio = models.FloatField(default=0)
    calmar_ratio = models.FloatField(default=0)
    profit_factor = models.FloatField(default=0)
    avg_trade_return_pct = models.FloatField(default=0)
    best_trade_pct = models.FloatField(default=0)
    worst_trade_pct = models.FloatField(default=0)
    avg_win_pct = models.FloatField(default=0)
    avg_loss_pct = models.FloatField(default=0)
    risk_reward_ratio = models.FloatField(default=0)
    avg_trade_duration_days = models.FloatField(default=0)

    equity_curve = models.JSONField(default=list)
    drawdown_series = models.JSONField(default=list)
    trade_log = models.JSONField(default=list)
    monthly_returns = models.JSONField(default=dict)

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Sim: {self.strategy.name} {self.start_date}->{self.end_date} ({len(self.symbols)} symbols)"
