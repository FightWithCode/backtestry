from django.urls import path
from . import views

urlpatterns = [
    path("lab/strategies/<uuid:pk>/tunables/", views.TunablesView.as_view(), name="lab-tunables"),
    path("lab/runs/", views.LabRunListCreateView.as_view(), name="lab-run-list-create"),
    path("lab/runs/<uuid:pk>/", views.LabRunDetailView.as_view(), name="lab-run-detail"),
    path("lab/runs/<uuid:pk>/status/", views.LabRunStatusView.as_view(), name="lab-run-status"),
]
