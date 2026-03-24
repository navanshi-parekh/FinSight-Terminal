# FinSight Terminal v2.0 📈
**Institutional-Grade Predictive Equity Analytics Engine**

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://finsight-terminal.onrender.com)
[![Backend API](https://img.shields.io/badge/API-FastAPI-blue)](https://finsight-api-r9d6.onrender.com)

FinSight Terminal is a full-stack financial analytics platform designed to bridge the gap between raw market data and actionable investment intelligence. Built for modern investors, it combines real-time data fetching with predictive risk metrics like Portfolio Beta and Diversification Scores.

---

## 🚀 Core Features

- **Predictive Analytics:** Real-time calculation of **Portfolio Beta** (Market Sensitivity) and stability-based **Diversification Scores**.
- **Dynamic Visualizations:** Interactive Composed Charts featuring Price trends, **20-Day SMA** indicators, and **Volume Price Trend (VPT)** overlays.
- **Institutional Intelligence:** Integrated **Sharpe Ratio** analysis to evaluate risk-adjusted returns against a 7.0% risk-free rate benchmark.
- **Head-to-Head Comparison:** Comparative analytics engine to evaluate two tickers side-by-side based on volatility and performance.
- **Portfolio Management:** Secure user authentication with **SQLite persistence** to track active holdings and realized gains/losses.
- **Intelligence Export:** Automated **PDF report generation** using `jsPDF` for institutional-grade record keeping.

## 🛠️ Tech Stack

### Frontend
- **React.js**: Functional components with Hooks (`useState`, `useEffect`, `useRef`).
- **Recharts**: Advanced SVG charting for financial time-series data.
- **jspdf / jspdf-autotable**: Client-side document generation.
- **Tailwind-inspired CSS**: Polished Glassmorphic UI with Dark/Light mode support.

### Backend
- **FastAPI (Python)**: High-performance asynchronous API framework.
- **yFinance**: Real-time integration with Yahoo Finance API.
- **Pandas & NumPy**: Quantitative analysis and statistical modeling.
- **SQLite**: Relational database for user profiles and portfolio tracking.

---

## 📈 Financial Metrics Explained

| Metric | Utility |
| :--- | :--- |
| **Sharpe Ratio** | Measures excess return per unit of deviation in an investment asset. |
| **Beta (β)** | Quantifies systematic risk—the sensitivity of the asset relative to the Nifty 50 (^NSEI). |
| **20-Day SMA** | Filters out "noise" to reveal the underlying short-term price trend. |
| **VPT** | Volume Price Trend helps confirm price direction based on cumulative money flow. |

---

## 🔧 Installation & Local Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/navanshi-parekh/FinSight-Terminal.git](https://github.com/navanshi-parekh/FinSight-Terminal.git)

2. **Backend Setup:**
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload

3. **Frontend Setup:**
    cd ../frontend
    npm install
    npm start
