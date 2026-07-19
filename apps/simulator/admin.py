from django.contrib import admin
from .models import SimulatorRun


@admin.register(SimulatorRun)
class SimulatorRunAdmin(admin.ModelAdmin):
    list_display = ("strategy", "start_date", "end_date", "total_trades", "total_return_pct", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("strategy__name",)
    readonly_fields = ("id", "strategy", "base_config", "trade_log", "equity_curve", "created_at", "completed_at", "error")
    ordering = ("-created_at",)
