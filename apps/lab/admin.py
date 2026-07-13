from django.contrib import admin
from .models import LabRun, LabVariant, LabResult


class LabVariantInline(admin.TabularInline):
    model = LabVariant
    extra = 0
    readonly_fields = ("index", "label", "overrides")
    fields = readonly_fields
    can_delete = False
    show_change_link = True


@admin.register(LabRun)
class LabRunAdmin(admin.ModelAdmin):
    list_display = ("strategy", "symbols_display", "variant_count", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("strategy__name",)
    readonly_fields = ("id", "strategy", "base_config", "overrides_spec", "created_at", "completed_at", "error")
    inlines = (LabVariantInline,)
    ordering = ("-created_at",)

    def symbols_display(self, obj):
        return ", ".join(obj.symbols or [])
    symbols_display.short_description = "Symbols"


@admin.register(LabVariant)
class LabVariantAdmin(admin.ModelAdmin):
    list_display = ("run", "index", "label")
    search_fields = ("run__strategy__name", "label")
    readonly_fields = ("run", "resolved_config")


@admin.register(LabResult)
class LabResultAdmin(admin.ModelAdmin):
    list_display = ("variant", "symbol", "total_return_pct", "win_rate", "total_trades", "sharpe_ratio")
    list_filter = ("symbol",)
    search_fields = ("variant__run__strategy__name", "symbol")
    readonly_fields = ("variant", "symbol")
    ordering = ("symbol",)
