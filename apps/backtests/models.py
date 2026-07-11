import uuid
from django.db import models
from apps.strategies.models import Strategy


class BacktestRun(models.Model):
    STATUS = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE, related_name="backtests")
    symbols = models.JSONField()
    start_date = models.DateField()
    end_date = models.DateField()
    initial_capital = models.FloatField(default=100000)
    commission_pct = models.FloatField(default=0.0)
    slippage_pct = models.FloatField(default=0.0)
    script_version_used = models.IntegerField()
    status = models.CharField(max_length=20, choices=STATUS, default="queued")
    error = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.strategy.name} — {', '.join(self.symbols)}"


class BacktestResult(models.Model):
    run = models.ForeignKey(BacktestRun, on_delete=models.CASCADE, related_name="results")
    symbol = models.CharField(max_length=20)

    total_trades = models.IntegerField(default=0)
    winning_trades = models.IntegerField(default=0)
    losing_trades = models.IntegerField(default=0)
    win_rate = models.FloatField(default=0)
    total_return_pct = models.FloatField(default=0)
    max_drawdown_pct = models.FloatField(default=0)
    sharpe_ratio = models.FloatField(default=0)
    profit_factor = models.FloatField(default=0)
    avg_trade_return_pct = models.FloatField(default=0)
    best_trade_pct = models.FloatField(default=0)
    worst_trade_pct = models.FloatField(default=0)

    equity_curve = models.JSONField(default=list)
    drawdown_series = models.JSONField(default=list)
    trade_log = models.JSONField(default=list)
    signal_coverage = models.JSONField(default=dict)
    chart_data = models.JSONField(default=dict)

    class Meta:
        ordering = ["symbol"]

    def __str__(self):
        return f"{self.run} — {self.symbol}"
