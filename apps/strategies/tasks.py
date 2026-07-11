import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def scrape_and_generate_script(self, strategy_id: str, source_type: str, input_value: str):
    """
    1. Set script_status = "generating"
    2. Scrape source → raw text
    3. Extract structured strategy data with Gemini
    4. Update Strategy fields
    5. Generate + validate backtest script
    6. Archive old script if exists
    7. Save new script
    """
    from .models import Strategy, StrategyScriptHistory

    try:
        strategy = Strategy.objects.get(pk=strategy_id)
    except Strategy.DoesNotExist:
        logger.error("Strategy %s not found", strategy_id)
        return

    strategy.script_status = "generating"
    strategy.script_error = None
    strategy.save(update_fields=["script_status", "script_error"])

    try:
        from .scraper import scrape_source
        logger.info("Scraping source for strategy %s", strategy_id)
        raw_text = scrape_source(source_type, input_value)

        from .strategy_extractor import extract_strategy_details, extract_strategy_config
        logger.info("Extracting strategy data for %s", strategy_id)
        structured = extract_strategy_details(raw_text)

        def _as_list(val):
            if isinstance(val, list):
                return val
            if isinstance(val, dict):
                return list(val.values())
            if val:
                return [str(val)]
            return []

        strategy.name = structured.get("name", "Unnamed Strategy") or "Unnamed Strategy"
        strategy.description = structured.get("description", "") or ""
        strategy.timeframe = structured.get("timeframe", "1d") or "1d"
        strategy.indicators = _as_list(structured.get("indicators"))
        strategy.candle_patterns = _as_list(structured.get("candle_patterns"))
        strategy.entry_rules = _as_list(structured.get("entry_rules"))
        strategy.exit_rules = _as_list(structured.get("exit_rules"))
        strategy.step_wise_process = _as_list(structured.get("step_wise_process"))
        strategy.save(
            update_fields=[
                "name", "description", "timeframe", "indicators",
                "candle_patterns", "entry_rules", "exit_rules",
                "step_wise_process",
            ]
        )

        logger.info("Generating strategy config for %s", strategy_id)
        import json
        config = extract_strategy_config(structured)
        config_text = json.dumps(config)

        # Archive previous config if any
        if strategy.backtest_script:
            StrategyScriptHistory.objects.create(
                strategy=strategy,
                script=strategy.backtest_script,
                version=strategy.script_version,
                reason="regenerated",
            )

        strategy.backtest_script = config_text
        strategy.script_version += 1
        strategy.script_generated_at = timezone.now()
        strategy.script_status = "generated"
        strategy.script_error = None
        strategy.save(
            update_fields=[
                "backtest_script", "script_version",
                "script_generated_at", "script_status", "script_error",
            ]
        )

        # Archive as initial version
        StrategyScriptHistory.objects.create(
            strategy=strategy,
            script=config_text,
            version=strategy.script_version,
            reason="initial",
        )

        logger.info("Strategy %s script generated successfully", strategy_id)

    except Exception as exc:
        logger.exception("Failed to generate script for strategy %s", strategy_id)
        try:
            strategy.script_status = "failed"
            strategy.script_error = str(exc)
            strategy.save(update_fields=["script_status", "script_error"])
        except Exception:
            pass


@shared_task(bind=True, max_retries=0)
def regenerate_script_task(self, strategy_id: str):
    """
    Re-generate the backtest script for an existing strategy.
    Uses stored strategy data (no re-scraping).
    """
    from .models import Strategy, StrategyScriptHistory

    try:
        strategy = Strategy.objects.get(pk=strategy_id)
    except Strategy.DoesNotExist:
        logger.error("Strategy %s not found", strategy_id)
        return

    strategy.script_status = "generating"
    strategy.script_error = None
    strategy.save(update_fields=["script_status", "script_error"])

    try:
        from .strategy_extractor import extract_strategy_config
        import json

        structured = {
            "name": strategy.name,
            "description": strategy.description,
            "timeframe": strategy.timeframe,
            "indicators": strategy.indicators,
            "candle_patterns": strategy.candle_patterns,
            "entry_rules": strategy.entry_rules,
            "exit_rules": strategy.exit_rules,
            "step_wise_process": strategy.step_wise_process,
        }

        logger.info("Regenerating config for strategy %s", strategy_id)
        config = extract_strategy_config(structured)
        config_text = json.dumps(config)

        # Archive existing config
        if strategy.backtest_script:
            StrategyScriptHistory.objects.create(
                strategy=strategy,
                script=strategy.backtest_script,
                version=strategy.script_version,
                reason="regenerated",
            )

        strategy.backtest_script = config_text
        strategy.script_version += 1
        strategy.script_generated_at = timezone.now()
        strategy.script_status = "generated"
        strategy.script_error = None
        strategy.save(
            update_fields=[
                "backtest_script", "script_version",
                "script_generated_at", "script_status", "script_error",
            ]
        )

        StrategyScriptHistory.objects.create(
            strategy=strategy,
            script=config_text,
            version=strategy.script_version,
            reason="regenerated",
        )

        logger.info("Strategy %s script regenerated successfully", strategy_id)

    except Exception as exc:
        logger.exception("Failed to regenerate script for strategy %s", strategy_id)
        try:
            strategy.script_status = "failed"
            strategy.script_error = str(exc)
            strategy.save(update_fields=["script_status", "script_error"])
        except Exception:
            pass
