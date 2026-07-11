from django.urls import path
from . import views

urlpatterns = [
    path("backtests/", views.BacktestListCreateView.as_view(), name="backtest-list-create"),
    path("backtests/<uuid:pk>/", views.BacktestDetailView.as_view(), name="backtest-detail"),
    path("backtests/<uuid:pk>/status/", views.BacktestStatusView.as_view(), name="backtest-status"),
]
