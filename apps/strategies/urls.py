from django.urls import path
from . import views

urlpatterns = [
    path("strategies/", views.StrategyListCreateView.as_view(), name="strategy-list-create"),
    path("strategies/<uuid:pk>/", views.StrategyDetailView.as_view(), name="strategy-detail"),
    path("strategies/<uuid:pk>/status/", views.StrategyStatusView.as_view(), name="strategy-status"),
    path("strategies/<uuid:pk>/regenerate_script/", views.RegenerateScriptView.as_view(), name="strategy-regenerate"),
    path("strategies/<uuid:pk>/script_history/", views.ScriptHistoryView.as_view(), name="strategy-script-history"),
]
