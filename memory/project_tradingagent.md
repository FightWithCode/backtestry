---
name: project-tradingagent
description: TradingAgent SaaS project — AI-powered trading strategy backtesting platform built with Django + Celery + Gemini + Vanilla JS SPA
metadata:
  type: project
---

TradingAgent is a full-stack SaaS app for backtesting trading strategies discovered from YouTube, web pages, or keywords.

**Why:** User wants a complete working project from scratch with a monolithic architecture (Django serves both API and frontend SPA).

**Stack:**
- Backend: Django 4.2 + DRF, PostgreSQL, Celery + Redis, yfinance, pandas_ta, Gemini 2.5 Flash, RestrictedPython
- Frontend: Vanilla JS SPA in `templates/index.html` + `static/js/`, no build step, TailwindCSS/Chart.js/Lucide/highlight.js from CDN

**Architecture invariants:**
1. `backtest_script` stores ONLY the `run_strategy(df)` function — never changes the backtester
2. Gemini called ONCE per strategy (at scrape time) — never at backtest time
3. Frontend polls `/api/strategies/<id>/status/` every 5s and `/api/backtests/<id>/status/` every 3s
4. Django serves ALL routes via catch-all → `index.html`; SPA router handles client-side routing

**Project root:** `c:\Users\Admin\Desktop\Projects\TradingAgent2.0MonolithicClaude`

**How to apply:** When making changes, maintain the monolithic no-CORS architecture — frontend and API on same origin. Celery tasks must update model status fields in real time. All API responses use `{ success, data, error }` envelope.
