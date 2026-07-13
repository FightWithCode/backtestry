from django.contrib import admin
from .models import ScreenerUniverse, ScreenerRun, ScreenerSignal


class ScreenerSignalInline(admin.TabularInline):
    model = ScreenerSignal
    extra = 0
    readonly_fields = ("symbol", "direction", "entry_price", "entry_tag")
    fields = readonly_fields
    can_delete = False
    show_change_link = True


@admin.register(ScreenerUniverse)
class ScreenerUniverseAdmin(admin.ModelAdmin):
    list_display = ("name", "symbol_count", "is_default", "updated_at")
    search_fields = ("name",)

    def symbol_count(self, obj):
        return len(obj.symbols or [])


@admin.register(ScreenerRun)
class ScreenerRunAdmin(admin.ModelAdmin):
    list_display = ("strategy", "as_of_date", "symbols_scanned", "signals_found", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("strategy__name",)
    readonly_fields = ("id", "strategy", "base_config", "created_at", "completed_at", "error")
    inlines = (ScreenerSignalInline,)
    ordering = ("-created_at",)


@admin.register(ScreenerSignal)
class ScreenerSignalAdmin(admin.ModelAdmin):
    list_display = ("run", "symbol", "direction", "entry_price", "as_of_date")
    list_filter = ("symbol", "direction")
    search_fields = ("run__strategy__name", "symbol")
    readonly_fields = ("run", "symbol")
