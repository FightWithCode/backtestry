# TradingAgent

AI-powered trading strategy backtesting platform. Paste a YouTube video, webpage, or keywords — the system scrapes the content, extracts the strategy, compiles it into a deterministic Python backtest function using Gemini 2.5 Flash, and lets you run it on real market data via yfinance.

## Architecture

- **Django 4.2 + DRF** — serves both the REST API and the SPA frontend
- **Celery + Redis** — async scraping and backtesting tasks
- **Gemini 2.5 Flash** — strategy extraction and script generation (called once per strategy)
- **RestrictedPython sandbox** — safe execution of AI-generated scripts
- **yfinance** (default) or **Upstox v3** — OHLCV data for backtesting, screening, and lab runs, switchable via `DATA_PROVIDER`
- **Vanilla JS SPA** — client-side routing, no build step, no npm

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```
DJANGO_SECRET_KEY=your-secret-key-here
DEBUG=True
DATABASE_URL=postgresql://user:pass@localhost:5432/tradingagent
REDIS_URL=redis://localhost:6379/0
GEMINI_API_KEY=your-gemini-api-key-here
```

### 3. Create the database

```bash
createdb tradingagent   # or use pgAdmin / your preferred tool
```

### 4. Run migrations

```bash
python manage.py migrate
```

### 5. Collect static files

```bash
python manage.py collectstatic --noinput
```

### 6. Start Django

```bash
python manage.py runserver
```

Visit **http://localhost:8000** — with `DEBUG=True`, Redis and Celery are not needed. All tasks (scraping, script generation, backtesting) run synchronously in the same process.

> **Production only (`DEBUG=False`):** start Redis and a Celery worker before Django.
> ```bash
> redis-server
> celery -A config worker --loglevel=info --concurrency=4
> python manage.py runserver
> ```

## Usage

1. Click **New Strategy** and paste a YouTube URL, webpage URL, or enter keywords
2. The system scrapes the source, extracts the strategy with AI, and generates a Python backtest function
3. Once the script is generated, open the strategy and configure a backtest (symbols, date range, capital)
4. Results include equity curve, drawdown chart, win/loss metrics, and a full trade log

## API Endpoints

All responses: `{ "success": bool, "data": any, "error": str|null }`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/strategies/` | List all strategies |
| POST | `/api/strategies/` | Create strategy + trigger generation |
| GET | `/api/strategies/<id>/` | Full strategy detail |
| DELETE | `/api/strategies/<id>/` | Delete strategy |
| GET | `/api/strategies/<id>/status/` | Poll generation status |
| POST | `/api/strategies/<id>/regenerate_script/` | Re-generate script |
| GET | `/api/strategies/<id>/script_history/` | Script version history |
| POST | `/api/backtests/` | Create backtest run |
| GET | `/api/backtests/<id>/` | Full results with chart data |
| GET | `/api/backtests/<id>/status/` | Poll backtest status |

## Notes

- **Intraday intervals** (5m, 15m, 1h): yfinance limits lookback to 60 days; Upstox limits vary by interval (1 month for ≤15min, 1 quarter for 30m/1h/4h, 1 decade for daily — see `apps/backtests/upstox_client.py`). Start dates are clamped automatically either way.
- **Script regeneration**: Re-runs Gemini on the stored strategy data (no re-scraping). Previous scripts are archived in StrategyScriptHistory.
- **No CORS needed**: Frontend and API are served from the same Django process.
- **Upstox data provider**: set `DATA_PROVIDER=upstox` and `UPSTOX_ACCESS_TOKEN` in `.env` to fetch OHLCV from Upstox v3 instead of yfinance. Upstox only covers NSE/BSE — symbols use the same `SYMBOL.NS` / `SYMBOL.BO` convention and are resolved to Upstox instrument keys automatically via its daily instrument master file. Access tokens expire daily around 3:30am IST and must be refreshed via Upstox's OAuth login flow.
