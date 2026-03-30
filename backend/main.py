# main.py — FinSight Terminal Backend
# FMP for global stocks + Finnhub for Indian stocks (NSE/BSE)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FMP_KEY     = "tmRl3Cj23ZcuadgcojQKefrai83sKIwP"
FMP_BASE    = "https://financialmodelingprep.com/stable"
FINNHUB_KEY = "d751ilhr01qg1eo78j40d751ilhr01qg1eo78j4g"
FINNHUB_BASE = "https://finnhub.io/api/v1"

INDIAN_SUFFIXES = (".NS", ".BO")

KNOWN_NSE = {
    "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "HINDUNILVR",
    "SBIN", "BAJFINANCE", "BHARTIARTL", "KOTAKBANK", "LT", "AXISBANK",
    "ASIANPAINT", "MARUTI", "TITAN", "SUNPHARMA", "WIPRO", "ULTRACEMCO",
    "NESTLEIND", "POWERGRID", "NTPC", "ONGC", "TECHM", "HCLTECH",
    "DIVISLAB", "DRREDDY", "CIPLA", "APOLLOHOSP", "ADANIENT", "ADANIPORTS",
    "TATAMOTORS", "TATASTEEL", "JSWSTEEL", "HINDALCO", "COALINDIA",
    "BPCL", "INDUSINDBK", "GRASIM", "EICHERMOT", "BAJAJ-AUTO",
    "BAJAJFINSV", "BRITANNIA", "HEROMOTOCO", "ITC", "M&M", "VEDL",
    "ASHOKLEY", "TATAPOWER", "IRCTC", "PIDILITIND", "SIEMENS", "HAVELLS",
    "DMART", "NAUKRI", "ZOMATO", "PAYTM", "NYKAA", "POLICYBAZAAR",
    "HDFCLIFE", "SBILIFE", "ICICIPRULI", "BAJAJ-AUTO", "TATACONSUM",
    "AMBUJACEM", "SHREECEM", "GAIL", "IOC", "SAIL", "NMDC", "MUTHOOTFIN",
    "BANKBARODA", "PNB", "CANBK", "UNIONBANK", "FEDERALBNK", "IDFCFIRSTB",
    "PERSISTENT", "COFORGE", "LTIM", "MPHASIS", "OFSS", "KPITTECH",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_indian(ticker: str) -> bool:
    upper = ticker.upper()
    return upper.endswith(INDIAN_SUFFIXES) or upper.replace(".NS","").replace(".BO","") in KNOWN_NSE


def clean_ticker(ticker: str) -> str:
    return ticker.upper().replace(".NS", "").replace(".BO", "")


def finnhub_get(path: str, params: dict = {}) -> dict | list:
    params = {**params, "token": FINNHUB_KEY}
    try:
        with httpx.Client(timeout=20) as client:
            r = client.get(f"{FINNHUB_BASE}{path}", params=params)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        print(f"[FINNHUB ERROR] {path}: {e}")
        return {}


def fmp_get(path: str, params: dict = {}) -> dict | list:
    params = {**params, "apikey": FMP_KEY}
    try:
        with httpx.Client(timeout=20) as client:
            r = client.get(f"{FMP_BASE}{path}", params=params)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        print(f"[FMP ERROR] {path}: {e}")
        return {}


def calc_rsi(prices: pd.Series, window: int = 14) -> float:
    delta = prices.diff()
    gain  = delta.where(delta > 0, 0).rolling(window).mean()
    loss  = (-delta.where(delta < 0, 0)).rolling(window).mean()
    rs    = gain / loss
    rsi   = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1]) if not rsi.empty else 50.0


def calc_vpt_scaled(prices: pd.Series, volumes: pd.Series) -> pd.Series:
    vpt              = (volumes * prices.pct_change()).cumsum().fillna(0)
    vpt_min, vpt_max = vpt.min(), vpt.max()
    p_min,   p_max   = prices.min(), prices.max()
    return ((vpt - vpt_min) / (vpt_max - vpt_min + 1e-9)) * (p_max - p_min) + p_min


def build_history(prices: pd.Series, sma_20: pd.Series, vpt_scaled: pd.Series) -> list:
    tail_prices = prices.tail(60)
    tail_sma    = sma_20.tail(60)
    tail_vpt    = vpt_scaled.tail(60) if not vpt_scaled.empty else pd.Series(dtype=float)
    history = []
    for d, p in tail_prices.items():
        sma_val = tail_sma.get(d)
        vpt_val = tail_vpt.get(d) if not tail_vpt.empty else None
        history.append({
            "date":  str(d.date()),
            "price": round(float(p), 2),
            "sma":   round(float(sma_val), 2) if sma_val is not None and not np.isnan(float(sma_val)) else None,
            "vpt":   round(float(vpt_val), 2) if vpt_val is not None and not np.isnan(float(vpt_val)) else None,
        })
    return history


def build_metrics(ticker, prices, volumes, sector, industry, exchange,
                  current_price, mkt_cap, beta, pe_ratio, debt_equity,
                  dividend_msg, business_summary, company_name, currency="$"):
    sma_20      = prices.rolling(20).mean()
    current_rsi = calc_rsi(prices)
    vpt_scaled  = calc_vpt_scaled(prices, volumes) if not volumes.empty else pd.Series(dtype=float)

    returns       = prices.pct_change().dropna()
    volatility    = float(returns.std() * np.sqrt(252) * 100)
    annual_return = float(((prices.iloc[-1] / prices.iloc[0]) - 1) * 100)
    sharpe        = (annual_return - 7.0) / volatility if volatility != 0 else 0

    verdict    = "Bargain" if current_rsi < 35 else "Expensive" if current_rsi > 65 else "Fairly Priced"
    rec        = "✅ Buy" if current_rsi < 60 and sharpe > 0.5 else "⏳ Hold/Wait"
    ai_summary = (
        f"{ticker} ({sector}) is currently {verdict.lower()}. "
        f"Sharpe: {round(sharpe, 2)} | 1Y Return: {round(annual_return, 1)}% | "
        f"Volatility: {round(volatility, 1)}%."
    )

    return {
        "symbol":         ticker,
        "name":           company_name,
        "price":          round(float(current_price), 2),
        "currency":       currency,
        "vol":            round(volatility, 1),
        "return":         round(annual_return, 1),
        "sharpe":         round(sharpe, 2),
        "risk":           "High" if volatility > 30 else "Low" if volatility < 15 else "Medium",
        "verdict":        verdict,
        "sector":         sector,
        "industry":       industry,
        "exchange":       exchange,
        "mkt_cap":        mkt_cap,
        "beta":           round(float(beta), 2) if beta else "N/A",
        "debt_equity":    debt_equity,
        "pe_ratio":       pe_ratio,
        "dividend":       dividend_msg,
        "summary":        business_summary,
        "recommendation": rec,
        "ai_summary":     ai_summary,
        "history":        build_history(prices, sma_20, vpt_scaled),
        "raw_returns":    returns.tolist(),
    }


# ── Indian stocks via Finnhub ─────────────────────────────────────────────────

def process_indian_stock(ticker: str) -> dict:
    display      = clean_ticker(ticker)
    finnhub_sym  = f"NSE:{display}"

    # 1. Quote (current price)
    quote = finnhub_get("/quote", {"symbol": finnhub_sym})
    if not quote or quote.get("c", 0) == 0:
        # Try BSE
        finnhub_sym = f"BSE:{display}"
        quote = finnhub_get("/quote", {"symbol": finnhub_sym})
        exchange = "BSE"
    else:
        exchange = "NSE"

    if not quote or quote.get("c", 0) == 0:
        return {"error": f"'{display}' not found on NSE or BSE via Finnhub."}

    current_price = quote.get("c", 0)

    # 2. Company profile
    profile = finnhub_get("/stock/profile2", {"symbol": finnhub_sym})
    company_name     = profile.get("name") or display
    sector           = profile.get("finnhubIndustry") or "General Market"
    industry         = sector
    business_summary = f"{company_name} is listed on {exchange}. Sector: {sector}."
    mkt_cap_raw      = profile.get("marketCapitalization")
    mkt_cap          = int(mkt_cap_raw * 1e6) if mkt_cap_raw else None
    beta             = None  # Finnhub free tier doesn't provide beta for NSE

    # 3. Basic financials
    fins = finnhub_get("/stock/metric", {"symbol": finnhub_sym, "metric": "all"})
    metrics = fins.get("metric", {})
    pe_raw      = metrics.get("peBasicExclExtraTTM") or metrics.get("peTTM")
    pe_ratio    = round(float(pe_raw), 2) if pe_raw else "N/A"
    de_raw      = metrics.get("totalDebt/totalEquityAnnual")
    debt_equity = round(float(de_raw), 2) if de_raw else "N/A"
    div_raw     = metrics.get("dividendYieldIndicatedAnnual") or 0
    dividend_msg = f"💰 Dividend ({round(float(div_raw), 2)}%)" if div_raw and float(div_raw) > 0 else None

    # 4. Historical candles (Finnhub uses Unix timestamps)
    end_ts   = int(time.time())
    start_ts = int((datetime.now() - timedelta(days=365)).timestamp())

    candles = finnhub_get("/stock/candle", {
        "symbol":     finnhub_sym,
        "resolution": "D",
        "from":       start_ts,
        "to":         end_ts,
    })

    if not candles or candles.get("s") != "ok" or not candles.get("c"):
        return {"error": f"No historical data for '{display}' on Finnhub."}

    closes  = candles["c"]
    volumes = candles.get("v", [1] * len(closes))
    timestamps = candles["t"]

    dates   = pd.to_datetime(timestamps, unit="s").normalize()
    prices  = pd.Series(closes, index=dates, dtype=float).ffill().dropna()
    vols    = pd.Series(volumes, index=dates, dtype=float).ffill().dropna()

    return build_metrics(
        display, prices, vols, sector, industry, exchange,
        current_price, mkt_cap, beta, pe_ratio, debt_equity,
        dividend_msg, business_summary, company_name, currency="₹"
    )


# ── Global stocks via FMP ─────────────────────────────────────────────────────

def process_fmp_stock(ticker: str) -> dict:
    end_date   = datetime.today().strftime("%Y-%m-%d")
    start_date = (datetime.today() - timedelta(days=365)).strftime("%Y-%m-%d")

    hist_raw = fmp_get("/historical-price-eod/full", {"symbol": ticker, "from": start_date, "to": end_date})

    if isinstance(hist_raw, list):
        historical = hist_raw
    elif isinstance(hist_raw, dict):
        historical = hist_raw.get("historical", [])
    else:
        historical = []

    if not historical:
        return {"error": f"Ticker '{ticker}' not found or FMP returned no data."}

    hist         = pd.DataFrame(historical).sort_values("date")
    hist["date"] = pd.to_datetime(hist["date"])
    hist         = hist.set_index("date")
    prices       = hist["close"].ffill().dropna()
    volumes      = hist["volume"].ffill().dropna() if "volume" in hist.columns else pd.Series(dtype=float)

    if prices.empty:
        return {"error": f"No price data for {ticker}."}

    profile_raw = fmp_get("/profile", {"symbol": ticker})
    profile = profile_raw[0] if isinstance(profile_raw, list) and profile_raw else (profile_raw if isinstance(profile_raw, dict) else {})

    ratios_raw = fmp_get("/ratios-ttm", {"symbol": ticker})
    ratios = ratios_raw[0] if isinstance(ratios_raw, list) and ratios_raw else (ratios_raw if isinstance(ratios_raw, dict) else {})

    sector           = profile.get("sector") or "General Market"
    industry         = profile.get("industry") or ""
    business_summary = profile.get("description") or "No description available."
    current_price    = profile.get("price") or round(float(prices.iloc[-1]), 2)
    mkt_cap          = profile.get("marketCap")
    beta             = profile.get("beta")
    exchange         = profile.get("exchange") or ""
    company_name     = profile.get("companyName") or ticker

    pe_ratio    = ratios.get("peRatioTTM")
    pe_ratio    = round(float(pe_ratio), 2) if pe_ratio else "N/A"
    debt_equity = ratios.get("debtEquityRatioTTM")
    debt_equity = round(float(debt_equity), 2) if debt_equity else "N/A"
    div_yield   = profile.get("lastDividend") or 0
    dividend_msg = f"💰 Dividend (${round(float(div_yield), 2)})" if div_yield and float(div_yield) > 0 else None

    return build_metrics(
        ticker, prices, volumes, sector, industry, exchange,
        current_price, mkt_cap, beta, pe_ratio, debt_equity,
        dividend_msg, business_summary, company_name, currency="$"
    )


# ── Smart router ──────────────────────────────────────────────────────────────

def process_stock_data(ticker: str) -> dict:
    ticker = ticker.upper().strip()
    if is_indian(ticker):
        return process_indian_stock(ticker)
    result = process_fmp_stock(ticker)
    if "error" in result:
        # Last resort: try as Indian stock
        indian = process_indian_stock(ticker)
        if "error" not in indian:
            return indian
    return result


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/analyze/{ticker}")
def analyze(ticker: str):
    return process_stock_data(ticker)


@app.get("/api/compare/{t1}/{t2}")
def compare(t1: str, t2: str):
    s1 = process_stock_data(t1)
    s2 = process_stock_data(t2)

    if "error" in s1 or "error" in s2:
        return [s1, s2]

    r1, r2  = pd.Series(s1["raw_returns"]), pd.Series(s2["raw_returns"])
    min_len = min(len(r1), len(r2))
    correlation = round(r1.tail(min_len).corr(r2.tail(min_len)), 2)

    score1  = (s1["sharpe"] * 2) + (100 - s1["vol"] / 10)
    score2  = (s2["sharpe"] * 2) + (100 - s2["vol"] / 10)
    winner  = s1["symbol"] if score1 > score2 else s2["symbol"]
    diverse = "Diversified portfolio" if correlation < 0.7 else "Highly correlated — similar risk"

    return {
        "stocks":      [s1, s2],
        "correlation": correlation,
        "winner":      winner,
        "verdict":     f"Correlation: {correlation}. {diverse}.",
    }


@app.get("/api/search/{query}")
def search_stocks(query: str):
    results = []

    # FMP search for global stocks
    data = fmp_get("/search-name", {"query": query, "limit": 4})
    if not isinstance(data, list):
        data = fmp_get("/search-symbol", {"query": query, "limit": 4})
    if isinstance(data, list):
        results = [
            {"symbol": i.get("symbol",""), "name": i.get("name") or i.get("companyName","N/A"), "exchange": i.get("exchangeShortName","")}
            for i in data if i.get("symbol")
        ]

    # NSE suggestions from known list
    query_upper = query.upper()
    nse_matches = sorted([s for s in KNOWN_NSE if s.startswith(query_upper)])[:3]
    for sym in nse_matches:
        if not any(r["symbol"] == sym for r in results):
            results.append({"symbol": sym, "name": f"{sym} (NSE)", "exchange": "NSE"})

    return results[:7]


@app.get("/health")
def health():
    return {"status": "ok", "global": "FMP Stable", "indian": "Finnhub"}