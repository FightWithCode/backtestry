from django.urls import path
from . import views

urlpatterns = [
    path("simulator/runs/", views.SimulatorRunListCreateView.as_view(), name="simulator-run-list-create"),
    path("simulator/runs/<uuid:pk>/", views.SimulatorRunDetailView.as_view(), name="simulator-run-detail"),
    path("simulator/runs/<uuid:pk>/status/", views.SimulatorRunStatusView.as_view(), name="simulator-run-status"),
]
