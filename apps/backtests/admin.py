from django.contrib import admin
from .models import BacktestRun, BacktestResult


class BacktestResultInline(admin.TabularInline):
    model = BacktestResult
    extra = 0
    readonly_fields = (
        "symbol", "total_trades", "winning_trades", "losing_trades",
        "win_rate", "total_return_pct", "max_drawdown_pct",
        "sharpe_ratio", "profit_factor",
    )
    fields = readonly_fields
    can_delete = False
    show_change_link = True


@admin.register(BacktestRun)
class BacktestRunAdmin(admin.ModelAdmin):
    list_display  = ("strategy", "symbols_display", "start_date", "end_date", "status", "created_at")
    list_filter   = ("status",)
    search_fields = ("strategy__name",)
    readonly_fields = ("id", "strategy", "script_version_used", "created_at", "completed_at", "error")
    inlines = (BacktestResultInline,)
    ordering = ("-created_at",)

    def symbols_display(self, obj):
        return ", ".join(obj.symbols or [])
    symbols_display.short_description = "Symbols"


@admin.register(BacktestResult)
class BacktestResultAdmin(admin.ModelAdmin):
    list_display  = ("run", "symbol", "total_return_pct", "win_rate", "total_trades", "sharpe_ratio")
    list_filter   = ("symbol",)
    search_fields = ("run__strategy__name", "symbol")
    readonly_fields = ("run", "symbol")
    ordering = ("symbol",)
