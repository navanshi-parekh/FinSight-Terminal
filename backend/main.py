import sqlite3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import time
import yfinance as yf
import pandas as pd
import numpy as np
import json
import requests
import os

app = FastAPI()

# --- RATE LIMIT BYPASS SETUP ---
# We create a global session with real browser headers to prevent Render IP blocking
session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATABASE SETUP ---
def init_db():
    conn = sqlite3.connect('finsight.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (username TEXT PRIMARY KEY, password TEXT, balance REAL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS portfolio 
                 (username TEXT, symbol TEXT, qty INTEGER, avgPrice REAL,
                  PRIMARY KEY (username, symbol))''')
    conn.commit()
    conn.close()

init_db()

# --- AUTH & PORTFOLIO MANAGEMENT ---

@app.post("/api/register")
async def register(data: dict):
    conn = sqlite3.connect('finsight.db')
    c = conn.cursor()
    try:
        c.execute("INSERT INTO users VALUES (?, ?, ?)", 
                  (data['username'], data['password'], data.get('balance', 1000000)))
        conn.commit()
        return {"success": True}
    except sqlite3.IntegrityError:
        return {"success": False, "message": "Username already exists"}
    finally:
        conn.close()

@app.post("/api/login")
async def login(data: dict):
    conn = sqlite3.connect('finsight.db')
    c = conn.cursor()
    c.execute("SELECT username, balance FROM users WHERE username=? AND password=?", 
              (data['username'], data['password']))
    user = c.fetchone()
    if user:
        c.execute("SELECT symbol, qty, avgPrice FROM portfolio WHERE username=?", (user[0],))
        portfolio = [{"symbol": r[0], "qty": r[1], "avgPrice": r[2]} for r in c.fetchall()]
        conn.close()
        return {"success": True, "user": user[0], "balance": user[1], "portfolio": portfolio}
    conn.close()
    return {"success": False, "message": "Invalid Credentials"}

@app.post("/api/update-holding")
async def update_holding(data: dict):
    username = data.get("username")
    symbol = data.get("symbol").upper()
    qty = int(data.get("qty"))
    avg_price = float(data.get("avgPrice"))
    conn = sqlite3.connect('finsight.db')
    c = conn.cursor()
    c.execute("""INSERT OR REPLACE INTO portfolio (username, symbol, qty, avgPrice) 
                 VALUES (?, ?, ?, ?)""", (username, symbol, qty, avg_price))
    conn.commit()
    c.execute("SELECT symbol, qty, avgPrice FROM portfolio WHERE username=?", (username,))
    new_portfolio = [{"symbol": r[0], "qty": r[1], "avgPrice": r[2]} for r in c.fetchall()]
    conn.close()
    return {"success": True, "portfolio": new_portfolio}

@app.post("/api/remove-holding")
async def remove_holding(data: dict):
    username = data.get("username")
    symbol = data.get("symbol").upper()
    conn = sqlite3.connect('finsight.db')
    c = conn.cursor()
    c.execute("DELETE FROM portfolio WHERE username=? AND symbol=?", (username, symbol))
    conn.commit()
    c.execute("SELECT symbol, qty, avgPrice FROM portfolio WHERE username=?", (username,))
    new_portfolio = [{"symbol": r[0], "qty": r[1], "avgPrice": r[2]} for r in c.fetchall()]
    conn.close()
    return {"success": True, "portfolio": new_portfolio}

# --- NEW PREDICTIVE ANALYTICS ENDPOINT ---

@app.get("/api/portfolio-analysis/{username}")
def analyze_portfolio(username: str):
    conn = sqlite3.connect('finsight.db')
    c = conn.cursor()
    c.execute("SELECT symbol, qty, avgPrice FROM portfolio WHERE username=?", (username,))
    holdings = c.fetchall()
    conn.close()
    if not holdings: return {"error": "No holdings found"}

    try:
        symbols = [h[0] for h in holdings]
        all_tickers = symbols + ["^NSEI"]
        # Use session here too
        data = yf.download(all_tickers, period="1y", session=session)['Close'].ffill().dropna()
        returns = data.pct_change().dropna()
        total_value = sum(h[1] * data[h[0]].iloc[-1] for h in holdings)
        individual_betas = {}
        market_returns = returns["^NSEI"]
        portfolio_beta = 0
        for h in holdings:
            sym = h[0]
            beta = returns[sym].cov(market_returns) / market_returns.var() if market_returns.var() != 0 else 1.0
            individual_betas[sym] = round(beta, 2)
            weight = (h[1] * data[sym].iloc[-1]) / total_value
            portfolio_beta += beta * weight
        div_score = 0
        if len(symbols) > 1:
            avg_corr = returns[symbols].corr().values[np.triu_indices(len(symbols), k=1)].mean()
            div_score = round((1 - max(0, avg_corr)) * 100)
        return {
            "portfolio_beta": round(portfolio_beta, 2),
            "diversification_score": div_score,
            "individual_betas": individual_betas,
            "prediction": "Aggressive" if portfolio_beta > 1.2 else "Defensive" if portfolio_beta < 0.8 else "Market-Neutral"
        }
    except Exception as e: return {"error": str(e)}

# --- CORE ANALYSIS LOGIC ---

def process_stock_data(ticker: str):
    try:
        # Integrated the session bypass directly here
        ticker_obj = yf.Ticker(ticker.upper(), session=session)
        df = ticker_obj.history(period="1y")
        
        if df.empty: 
            return {"error": f"Ticker {ticker} rate limited or not found."}

        prices = df['Close'].ffill().dropna()
        volumes = df['Volume'].ffill().dropna() 
        info = ticker_obj.info

        sma_20 = prices.rolling(window=20).mean()
        vpt = (volumes * prices.pct_change()).cumsum().fillna(0)
        vpt_scaled = ((vpt - vpt.min()) / (vpt.max() - vpt.min() + 1e-9)) * (prices.max() - prices.min()) + prices.min()

        returns = prices.pct_change().dropna()
        volatility = float(returns.std() * np.sqrt(252) * 100)
        annual_return = float(((prices.iloc[-1] / prices.iloc[0]) - 1) * 100)
        sharpe = (annual_return - 7.0) / volatility if volatility != 0 else 0
        
        sector = info.get('sector', 'General Market')
        verdict = "Bargain" if sharpe > 1.5 else "Expensive" if sharpe < 0.5 else "Fairly Priced"
        
        history_data = []
        for d, p in prices.tail(60).items():
            history_data.append({
                "date": str(d.date()),
                "price": round(float(p), 2),
                "sma": round(float(sma_20[d]), 2) if not np.isnan(sma_20[d]) else None,
                "vpt": round(float(vpt_scaled[d]), 2) if not np.isnan(vpt_scaled[d]) else None
            })

        return {
            "symbol": ticker.upper(),
            "price": round(float(prices.iloc[-1]), 2),
            "vol": round(volatility, 1),
            "return": round(annual_return, 1),
            "sharpe": round(sharpe, 2),
            "risk": "High" if volatility > 30 else "Low" if volatility < 15 else "Medium",
            "verdict": verdict,
            "sector": sector,
            "debt_equity": info.get('debtToEquity', 'N/A'),
            "pe_ratio": round(info.get('trailingPE', 0), 2) if info.get('trailingPE') else 'N/A',
            "summary": info.get('longBusinessSummary', 'No detailed description available.'),
            "recommendation": "✅ Buy" if sharpe > 1 else "⏳ Hold/Wait",
            "ai_summary": f"{ticker.upper()} analysis suggests a {verdict.lower()} profile with a Sharpe of {round(sharpe, 2)}.",
            "history": history_data,
            "raw_returns": returns.tolist()
        }
    except Exception as e: return {"error": str(e)}

@app.get("/api/compare/{t1}/{t2}")
def compare(t1: str, t2: str):
    s1 = process_stock_data(t1)
    s2 = process_stock_data(t2)
    if "error" not in s1 and "error" not in s2:
        r1, r2 = pd.Series(s1['raw_returns']), pd.Series(s2['raw_returns'])
        correlation = round(r1.corr(r2), 2)
        score1 = (s1['sharpe'] * 2) + (100 - s1['vol'] / 10)
        score2 = (s2['sharpe'] * 2) + (100 - s2['vol'] / 10)
        winner = s1['symbol'] if score1 > score2 else s2['symbol']
        return {"stocks": [s1, s2], "correlation": correlation, "winner": winner, 
                "verdict": f"Correlation: {correlation}. {'Diverse' if correlation < 0.7 else 'Similar'} move."}
    return [s1, s2]

@app.get("/api/search/{query}")
def search_stocks(query: str):
    try:
        # Search also benefits from the session
        search = yf.Search(query, max_results=5)
        return [{"symbol": q['symbol'], "name": q.get('shortname', 'N/A')} for q in search.quotes]
    except: return []

@app.get("/api/analyze/{ticker}")
def analyze(ticker: str): return process_stock_data(ticker)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)