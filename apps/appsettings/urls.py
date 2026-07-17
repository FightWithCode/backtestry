from django.urls import path
from . import views

urlpatterns = [
    path("settings/data-provider/", views.AppSettingsView.as_view(), name="app-settings"),
]
