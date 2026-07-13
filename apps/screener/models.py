import uuid
from django.db import models
from apps.strategies.models import Strategy


class ScreenerUniverse(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=255)
    symbols = models.JSONField(default=list)
    description = models.TextField(blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_default", "name"]

    def __str__(self):
        return f"{self.name} ({len(self.symbols)} symbols)"


class ScreenerRun(models.Model):
    STATUS = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE, related_name="screener_runs")
    universe = models.ForeignKey(ScreenerUniverse, on_delete=models.SET_NULL, null=True, blank=True, related_name="runs")

    # Snapshots, same rationale as apps/lab: a run's meaning shouldn't change
    # if the universe is edited or the strategy is regenerated afterward.
    symbols = models.JSONField(default=list)
    base_config = models.JSONField()

    timeframe = models.CharField(max_length=10, blank=True, default="")
    as_of_date = models.DateField()
    lookback_days = models.IntegerField(default=400)

    status = models.CharField(max_length=20, choices=STATUS, default="queued")
    error = models.TextField(null=True, blank=True)
    symbols_scanned = models.IntegerField(default=0)
    symbols_failed = models.JSONField(default=list)
    signals_found = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Screen: {self.strategy.name} on {self.as_of_date} ({len(self.symbols)} symbols)"


class ScreenerSignal(models.Model):
    run = models.ForeignKey(ScreenerRun, on_delete=models.CASCADE, related_name="signals")
    symbol = models.CharField(max_length=20)
    direction = models.CharField(max_length=10)
    as_of_date = models.DateField()
    entry_price = models.FloatField()
    entry_tag = models.CharField(max_length=100)

    exit_plan = models.JSONField(default=list)
    indicator_snapshot = models.JSONField(default=dict)
    rule_explanation = models.JSONField(default=dict)
    bar = models.JSONField(default=dict)

    class Meta:
        ordering = ["symbol"]

    def __str__(self):
        return f"{self.symbol} {self.direction} @ {self.entry_price}"
