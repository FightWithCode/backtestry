from django.contrib import admin
from .models import Strategy, StrategyScriptHistory


@admin.register(Strategy)
class StrategyAdmin(admin.ModelAdmin):
    list_display  = ("name", "source_type", "timeframe", "script_status", "script_version", "created_at")
    list_filter   = ("script_status", "source_type", "timeframe")
    search_fields = ("name", "description")
    readonly_fields = (
        "id", "script_version", "script_generated_at",
        "script_error", "created_at", "updated_at",
    )
    fieldsets = (
        ("Basic Info", {
            "fields": ("id", "name", "source_url", "source_type", "description", "timeframe"),
        }),
        ("Strategy Logic", {
            "fields": ("indicators", "candle_patterns", "entry_rules", "exit_rules", "step_wise_process"),
        }),
        ("Script", {
            "fields": ("script_status", "script_version", "script_generated_at", "script_error", "backtest_script"),
            "classes": ("collapse",),
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )
    ordering = ("-created_at",)


@admin.register(StrategyScriptHistory)
class StrategyScriptHistoryAdmin(admin.ModelAdmin):
    list_display  = ("strategy", "version", "reason", "generated_at")
    list_filter   = ("reason",)
    search_fields = ("strategy__name",)
    readonly_fields = ("strategy", "version", "reason", "generated_at", "script")
    ordering = ("-generated_at",)
