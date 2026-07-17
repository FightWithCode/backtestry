from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import AppSettings
from .serializers import AppSettingsSerializer


def ok(data):
    return Response({"success": True, "data": data, "error": None})


def err(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "data": None, "error": message}, status=code)


class AppSettingsView(APIView):
    """
    GET returns the current effective settings (never echoes back the raw
    token). PATCH updates data_provider and/or upstox_access_token in the DB
    and takes effect immediately for the next backtest/screener/lab task —
    no server restart needed, unlike changing DATA_PROVIDER in .env.
    """

    def get(self, request):
        return ok(AppSettingsSerializer(AppSettings.load()).data)

    def patch(self, request):
        instance = AppSettings.load()
        serializer = AppSettingsSerializer(instance, data=request.data, partial=True)
        if not serializer.is_valid():
            return err(str(serializer.errors))
        serializer.save()
        return ok(AppSettingsSerializer(instance).data)
