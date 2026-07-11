import uuid
from django.db import models


class Strategy(models.Model):
    SCRIPT_STATUS = [
        ("pending", "Pending"),
        ("generating", "Generating"),
        ("generated", "Generated"),
        ("failed", "Failed"),
        ("needs_review", "Needs Review"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=255)
    source_url = models.URLField(null=True, blank=True)
    source_type = models.CharField(max_length=50)  # "youtube", "webpage", "keyword"
    description = models.TextField()
    step_wise_process = models.JSONField(default=list)
    entry_rules = models.JSONField(default=list)
    exit_rules = models.JSONField(default=list)
    indicators = models.JSONField(default=list)
    candle_patterns = models.JSONField(default=list)
    timeframe = models.CharField(max_length=10)

    backtest_script = models.TextField(null=True, blank=True)
    script_version = models.IntegerField(default=0)
    script_generated_at = models.DateTimeField(null=True, blank=True)
    script_status = models.CharField(max_length=20, choices=SCRIPT_STATUS, default="pending")
    script_error = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class StrategyScriptHistory(models.Model):
    strategy = models.ForeignKey(Strategy, on_delete=models.CASCADE, related_name="script_history")
    script = models.TextField()
    version = models.IntegerField()
    generated_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(max_length=100)  # "initial", "regenerated", "manual_fix"

    class Meta:
        ordering = ["-generated_at"]

    def __str__(self):
        return f"{self.strategy.name} v{self.version}"
