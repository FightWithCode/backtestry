from django.urls import path
from . import views

urlpatterns = [
    path("screener/universes/", views.UniverseListCreateView.as_view(), name="screener-universe-list-create"),
    path("screener/universes/<uuid:pk>/", views.UniverseDetailView.as_view(), name="screener-universe-detail"),
    path("screener/runs/", views.ScreenerRunListCreateView.as_view(), name="screener-run-list-create"),
    path("screener/runs/<uuid:pk>/", views.ScreenerRunDetailView.as_view(), name="screener-run-detail"),
    path("screener/runs/<uuid:pk>/status/", views.ScreenerRunStatusView.as_view(), name="screener-run-status"),
]
