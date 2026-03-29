// App.js — FinSight Terminal (FMP Edition)

import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ComposedChart
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_BASE = "https://finsight-api-r9d6.onrender.com";

// ── Theme ─────────────────────────────────────────────────────────────────────
const makeTheme = (dark) => ({
  bg:       dark ? '#0d1117' : '#f0f2f5',
  card:     dark ? '#161b22' : '#ffffff',
  text:     dark ? '#f0f6fc' : '#1a1d23',
  subText:  dark ? '#8b949e' : '#64748b',
  border:   dark ? '#30363d' : '#e1e4e8',
  sidebar:  dark ? '#010409' : '#ffffff',
  inputBg:  dark ? '#0d1117' : '#f8fafc',
  accent:   '#38bdf8',
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n, digits = 1) =>
  n == null || n === 'N/A' ? 'N/A' : Number(n).toFixed(digits);

const fmtCap = (n) => {
  if (!n) return 'N/A';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n}`;
};

// ── Sub-components ────────────────────────────────────────────────────────────
const SuggestionsList = ({ suggestions, onSelect, theme }) => (
  <ul style={{
    position: 'absolute', top: '56px', width: '100%', zIndex: 1000,
    listStyle: 'none', padding: '8px', margin: 0,
    backgroundColor: theme.card, border: `1px solid ${theme.border}`,
    borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
  }}>
    {suggestions.map((s, idx) => (
      <li key={idx} onClick={() => onSelect(s.symbol)} style={{
        padding: '10px 14px', cursor: 'pointer', borderRadius: '10px',
        color: theme.text, borderBottom: idx < suggestions.length - 1 ? `1px solid ${theme.border}` : 'none',
        transition: '0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = theme.inputBg}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <div style={{ fontWeight: '700', fontSize: '14px' }}>{s.symbol}</div>
        <div style={{ fontSize: '11px', color: theme.subText, marginTop: '2px' }}>{s.name}</div>
      </li>
    ))}
  </ul>
);

const StatBox = ({ label, value, color, theme }) => (
  <div style={{
    flex: 1, padding: '14px', borderRadius: '16px',
    backgroundColor: theme.inputBg, textAlign: 'center',
  }}>
    <span style={{ fontSize: '8px', color: theme.subText, display: 'block', marginBottom: '6px', fontWeight: '800', letterSpacing: '0.08em' }}>
      {label}
    </span>
    <span style={{ fontWeight: '800', fontSize: '15px', color: color || theme.text }}>
      {value}
    </span>
  </div>
);

const CustomTooltip = ({ active, payload, label, theme }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: theme.card, border: `1px solid ${theme.border}`,
      borderRadius: '12px', padding: '12px 16px', fontSize: '12px', color: theme.text,
    }}>
      <div style={{ fontWeight: '700', marginBottom: '6px', color: theme.subText }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: '3px' }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [mode, setMode]           = useState("analyze");
  const [isDark, setIsDark]       = useState(false);
  const [t1, setT1]               = useState("");
  const [t2, setT2]               = useState("");
  const [results, setResults]     = useState([]);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showDrop, setShowDrop]   = useState(false);
  const [activeInput, setActiveInput] = useState(null);
  const [error, setError]         = useState("");
  const dropRef = useRef(null);

  const theme = makeTheme(isDark);

  // Persist watchlist + theme
  useEffect(() => {
    const wl = localStorage.getItem("finsight_watchlist");
    if (wl) setWatchlist(JSON.parse(wl));
    if (localStorage.getItem("finsight_theme") === "dark") setIsDark(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("finsight_watchlist", JSON.stringify(watchlist));
    localStorage.setItem("finsight_theme", isDark ? "dark" : "light");
  }, [watchlist, isDark]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Search autocomplete ───────────────────────────────────────────────────
  const handleSearch = (val, target) => {
    if (target === 't1') setT1(val); else setT2(val);
    setActiveInput(target);
    if (val.length > 1) {
      fetch(`${API_BASE}/api/search/${val}`)
        .then(r => r.json())
        .then(data => { setSuggestions(data); setShowDrop(true); })
        .catch(() => {});
    } else {
      setShowDrop(false);
    }
  };

  // ── Analyze / Compare ─────────────────────────────────────────────────────
  const handleAction = (manualTicker = null) => {
    const ticker1 = (manualTicker || t1).trim().toUpperCase();
    const ticker2 = t2.trim().toUpperCase();
    if (!ticker1) return;

    setLoading(true);
    setResults([]);
    setComparison(null);
    setShowDrop(false);
    setError("");

    const url = mode === "analyze" || manualTicker
      ? `${API_BASE}/api/analyze/${ticker1}`
      : `${API_BASE}/api/compare/${ticker1}/${ticker2}`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.stocks) {
          setResults(data.stocks);
          setComparison({ winner: data.winner, verdict: data.verdict, correlation: data.correlation });
        } else if (Array.isArray(data)) {
          setResults(data);
        } else {
          setResults([data]);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Could not reach the backend. Make sure the FastAPI server is running on port 8000.");
        setLoading(false);
      });
  };

  // ── PDF Export ────────────────────────────────────────────────────────────
  const downloadPDF = () => {
    if (!results.length) return;
    const doc  = new jsPDF();
    const ts   = new Date().toLocaleString();

    doc.setFontSize(22);
    doc.setTextColor(40, 44, 52);
    doc.text("FinSight Terminal — Investment Report", 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${ts} | Data: Financial Modeling Prep`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [['Symbol', 'Exchange', 'Price', 'P/E', 'D/E', 'Beta', 'Mkt Cap', 'Sharpe', 'Risk', 'Signal']],
      body: results.map(s => [
        s.symbol, s.exchange || '—', `$${s.price}`,
        s.pe_ratio, s.debt_equity, s.beta,
        fmtCap(s.mkt_cap), s.sharpe, s.risk, s.recommendation,
      ]),
      headStyles: { fillColor: [56, 189, 248] },
      theme: 'striped',
    });

    results.forEach(stock => {
      doc.addPage();
      doc.setFontSize(18);
      doc.setTextColor(40, 44, 52);
      doc.text(`Deep Dive: ${stock.symbol} — ${stock.sector}`, 14, 20);

      autoTable(doc, {
        startY: 30,
        head: [['Metric', 'Value', 'Context']],
        body: [
          ['RSI Verdict',      stock.verdict,       'Price momentum indicator (RSI-based).'],
          ['1Y Volatility',    `${stock.vol}%`,      'Annualised standard deviation of returns.'],
          ['1Y Return',        `${stock.return}%`,   'Total price return over 1 year.'],
          ['Sharpe Ratio',     stock.sharpe,         'Risk-adjusted return (hurdle rate: 7%).'],
          ['Beta',             stock.beta,           'Sensitivity vs. market.'],
          ['Debt / Equity',    stock.debt_equity,    'Financial leverage health.'],
          ['P/E Ratio (TTM)',  stock.pe_ratio,       'Trailing price-to-earnings ratio.'],
          ['Market Cap',       fmtCap(stock.mkt_cap),'Total market capitalisation.'],
          ['Volume Trend',     'VPT Active',         'Volume-weighted price trend overlay.'],
        ],
        margin: { left: 14 },
      });

      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.text("AI Summary:", 14, doc.lastAutoTable.finalY + 15);
      doc.setFontSize(10);
      const sumLines = doc.splitTextToSize(stock.ai_summary || '', 180);
      doc.text(sumLines, 14, doc.lastAutoTable.finalY + 23);

      doc.setFontSize(12);
      doc.text("Business Description:", 14, doc.lastAutoTable.finalY + 40);
      doc.setFontSize(10);
      const descLines = doc.splitTextToSize(stock.summary || 'No description.', 180);
      doc.text(descLines, 14, doc.lastAutoTable.finalY + 48);
    });

    doc.save(`FinSight_${results.map(s => s.symbol).join('_')}.pdf`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: theme.bg, minHeight: '100vh', transition: '0.3s', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* ── Sidebar ── */}
      <div style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: '220px',
        backgroundColor: theme.sidebar, borderRight: `1px solid ${theme.border}`,
        padding: '30px 16px', display: 'flex', flexDirection: 'column',
        transition: '0.3s', zIndex: 100,
      }}>
        <div style={{ fontWeight: '900', fontSize: '16px', color: theme.accent, marginBottom: '6px', letterSpacing: '-0.5px' }}>
          FinSight
        </div>
        <div style={{ fontSize: '11px', color: theme.subText, marginBottom: '24px' }}>Powered by FMP</div>

        <div style={{ fontSize: '10px', fontWeight: '800', color: theme.subText, letterSpacing: '0.08em', marginBottom: '12px' }}>
          WATCHLIST
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {watchlist.length === 0 && (
            <div style={{ fontSize: '12px', color: theme.subText, fontStyle: 'italic' }}>
              Star a stock to watch it
            </div>
          )}
          {watchlist.map(symbol => (
            <div key={symbol} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <button
                onClick={() => { setT1(symbol); setMode("analyze"); handleAction(symbol); }}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                  fontWeight: '700', fontSize: '13px', border: 'none',
                  backgroundColor: theme.inputBg, color: theme.text, textAlign: 'left',
                  transition: '0.15s',
                }}
              >
                {symbol}
              </button>
              <button
                onClick={() => setWatchlist(prev => prev.filter(s => s !== symbol))}
                style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
          <button onClick={downloadPDF} style={{
            width: '100%', padding: '11px', border: 'none', borderRadius: '12px',
            fontWeight: '700', cursor: 'pointer', backgroundColor: '#10b981',
            color: 'white', fontSize: '13px', marginBottom: '8px',
          }}>
            📄 Save PDF
          </button>
          <button onClick={() => setIsDark(!isDark)} style={{
            width: '100%', padding: '11px', border: 'none', borderRadius: '12px',
            fontWeight: '700', cursor: 'pointer',
            background: isDark
              ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
              : 'linear-gradient(135deg, #1e293b, #38bdf8)',
            color: 'white', fontSize: '13px',
          }}>
            {isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ paddingLeft: '240px', padding: '40px 40px 60px 260px' }}>
        <h1 style={{ color: theme.text, fontSize: '36px', fontWeight: '900', marginBottom: '4px', letterSpacing: '-1px' }}>
          FinSight Terminal
        </h1>
        <p style={{ color: theme.subText, fontSize: '13px', marginBottom: '32px' }}>
          Real-time stock analysis via Financial Modeling Prep
        </p>

        {/* Mode Tabs */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex', backgroundColor: 'rgba(100,116,139,0.1)',
            padding: '5px', borderRadius: '14px',
          }}>
            {["analyze", "compare"].map(m => (
              <button key={m} onClick={() => { setMode(m); setResults([]); setComparison(null); setError(""); }}
                style={{
                  padding: '10px 24px', border: 'none', borderRadius: '10px', fontWeight: '700',
                  cursor: 'pointer', fontSize: '13px', transition: '0.2s',
                  backgroundColor: mode === m ? (isDark ? '#f0f6fc' : '#ffffff') : 'transparent',
                  color: mode === m ? '#1a1d23' : theme.subText,
                  boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {m === "analyze" ? "📊 Single Analyze" : "⚖️ Head-to-Head"}
              </button>
            ))}
          </div>
        </div>

        {/* Search Row */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '40px', flexWrap: 'wrap' }} ref={dropRef}>
          <div style={{ position: 'relative' }}>
            <input
              placeholder="Ticker (e.g. AAPL)"
              value={t1}
              onChange={e => handleSearch(e.target.value, 't1')}
              onKeyDown={e => e.key === 'Enter' && handleAction()}
              style={{
                padding: '14px 18px', borderRadius: '14px', width: '220px',
                border: `2px solid ${theme.border}`, outline: 'none',
                backgroundColor: theme.inputBg, color: theme.text,
                fontSize: '14px', fontWeight: '600', transition: '0.2s',
              }}
            />
            {showDrop && activeInput === 't1' && suggestions.length > 0 && (
              <SuggestionsList suggestions={suggestions} onSelect={s => { setT1(s); setShowDrop(false); }} theme={theme} />
            )}
          </div>

          {mode === "compare" && (
            <div style={{ position: 'relative' }}>
              <input
                placeholder="Ticker 2 (e.g. MSFT)"
                value={t2}
                onChange={e => handleSearch(e.target.value, 't2')}
                onKeyDown={e => e.key === 'Enter' && handleAction()}
                style={{
                  padding: '14px 18px', borderRadius: '14px', width: '220px',
                  border: `2px solid ${theme.border}`, outline: 'none',
                  backgroundColor: theme.inputBg, color: theme.text,
                  fontSize: '14px', fontWeight: '600', transition: '0.2s',
                }}
              />
              {showDrop && activeInput === 't2' && suggestions.length > 0 && (
                <SuggestionsList suggestions={suggestions} onSelect={s => { setT2(s); setShowDrop(false); }} theme={theme} />
              )}
            </div>
          )}

          <button
            onClick={() => handleAction()}
            disabled={loading}
            style={{
              padding: '14px 36px', backgroundColor: loading ? '#94a3b8' : '#38bdf8',
              color: 'white', border: 'none', borderRadius: '14px',
              fontWeight: '800', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px', transition: '0.2s',
            }}
          >
            {loading ? "Analyzing…" : "Analyze →"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            backgroundColor: '#fef2f2', border: '1px solid #fca5a5',
            color: '#dc2626', padding: '14px 18px', borderRadius: '12px',
            marginBottom: '28px', fontSize: '13px',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Comparison Banner */}
        {comparison && (
          <div style={{
            padding: '24px 32px', borderRadius: '20px', marginBottom: '36px',
            border: `1px solid ${theme.accent}`,
            background: isDark ? 'rgba(56,189,248,0.05)' : 'rgba(56,189,248,0.04)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px',
          }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: theme.text }}>
                🏆 Optimal Pick: <span style={{ color: theme.accent }}>{comparison.winner}</span>
              </div>
              <div style={{ fontSize: '13px', color: theme.subText, marginTop: '4px' }}>{comparison.verdict}</div>
            </div>
            <div style={{
              backgroundColor: isDark ? '#1c2128' : '#f0f9ff',
              padding: '12px 20px', borderRadius: '12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '11px', color: theme.subText, marginBottom: '3px', fontWeight: '700' }}>CORRELATION</div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: comparison.correlation > 0.7 ? '#f87171' : '#34d399' }}>
                {comparison.correlation}
              </div>
            </div>
          </div>
        )}

        {/* Stock Cards */}
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', justifyContent: results.length === 1 ? 'flex-start' : 'center' }}>
          {results.map((stock, i) => {
            if (!stock || stock.error) {
              return (
                <div key={i} style={{
                  padding: '28px', borderRadius: '28px', width: '460px',
                  backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
                }}>
                  ⚠️ {stock?.error || "Unknown error"}
                </div>
              );
            }

            const riskColor = stock.risk === "High" ? "#f87171" : stock.risk === "Medium" ? "#fbbf24" : "#34d399";
            const inWatchlist = watchlist.includes(stock.symbol);

            return (
              <div key={i} style={{
                padding: '30px', borderRadius: '28px', width: '460px',
                backgroundColor: theme.card, border: `1px solid ${theme.border}`,
                boxShadow: isDark ? 'none' : '0 4px 24px rgba(0,0,0,0.06)',
                transition: '0.3s',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    padding: '6px 14px', borderRadius: '10px', fontSize: '11px', fontWeight: '800',
                    backgroundColor: `${riskColor}22`, color: riskColor,
                  }}>
                    {stock.recommendation}
                  </div>
                  <button
                    onClick={() => setWatchlist(prev =>
                      inWatchlist ? prev.filter(s => s !== stock.symbol) : [...prev, stock.symbol]
                    )}
                    style={{ background: 'none', border: 'none', fontSize: '26px', cursor: 'pointer', color: inWatchlist ? theme.accent : theme.subText, transition: '0.2s' }}
                    title={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    {inWatchlist ? "★" : "☆"}
                  </button>
                </div>

                {/* Symbol + sector */}
                <h2 style={{ margin: 0, fontSize: '30px', fontWeight: '900', color: theme.text }}>
                  {stock.symbol}
                  {stock.exchange && <span style={{ fontSize: '13px', fontWeight: '600', color: theme.subText, marginLeft: '10px' }}>{stock.exchange}</span>}
                </h2>
                <div style={{ fontSize: '12px', color: theme.accent, fontWeight: '700', marginTop: '2px', marginBottom: '4px' }}>
                  {stock.sector}{stock.industry ? ` · ${stock.industry}` : ''}
                </div>

                {stock.dividend && (
                  <div style={{
                    display: 'inline-block', backgroundColor: 'rgba(56,189,248,0.1)',
                    color: '#38bdf8', padding: '4px 10px', borderRadius: '8px',
                    fontSize: '11px', fontWeight: '700', marginBottom: '12px',
                  }}>
                    {stock.dividend}
                  </div>
                )}

                {/* AI Summary box */}
                <div style={{
                  padding: '16px', borderRadius: '16px', marginBottom: '16px',
                  backgroundColor: isDark ? '#1c2128' : '#f8fafc',
                  border: `1px solid ${theme.border}`,
                }}>
                  <p style={{ margin: 0, fontSize: '13px', color: theme.text, lineHeight: '1.65' }}>
                    {stock.ai_summary}
                  </p>
                </div>

                {/* Price */}
                <div style={{ margin: '16px 0 4px 0' }}>
                  <span style={{ fontSize: '44px', fontWeight: '900', color: theme.text, letterSpacing: '-2px' }}>
                    ${stock.price}
                  </span>
                  <span style={{
                    marginLeft: '12px', fontSize: '14px', fontWeight: '700',
                    color: stock.return >= 0 ? '#34d399' : '#f87171',
                  }}>
                    {stock.return >= 0 ? '▲' : '▼'} {Math.abs(stock.return)}% (1Y)
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: theme.subText, marginBottom: '20px' }}>
                  Mkt Cap: {fmtCap(stock.mkt_cap)} · Beta: {stock.beta}
                </div>

                {/* Chart */}
                <div style={{ width: '100%', height: 220, margin: '16px 0' }}>
                  <ResponsiveContainer>
                    <ComposedChart data={stock.history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#30363d" : "#e1e4e8"} />
                      <XAxis dataKey="date" hide />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip content={<CustomTooltip theme={theme} />} />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                      <Line name="Price" type="monotone" dataKey="price" stroke={riskColor} strokeWidth={3} dot={false} />
                      <Line name="20-Day SMA" type="monotone" dataKey="sma" stroke={isDark ? "#8b949e" : "#94a3b8"} strokeWidth={2} dot={false} strokeDasharray="4 4" />
                      <Line name="VPT Trend" type="monotone" dataKey="vpt" stroke="#a855f7" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Stat Grid */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <StatBox label="P/E (TTM)" value={stock.pe_ratio} theme={theme} />
                  <StatBox label="D/E" value={stock.debt_equity} theme={theme} />
                  <StatBox label="SHARPE" value={stock.sharpe} theme={theme} />
                  <StatBox label="VOLATILITY" value={`${stock.vol}%`} theme={theme} />
                  <StatBox label="RISK" value={stock.risk} color={riskColor} theme={theme} />
                </div>

                {/* Verdict chip */}
                <div style={{
                  marginTop: '18px', padding: '10px 16px', borderRadius: '12px',
                  backgroundColor: isDark ? '#1c2128' : '#f0f9ff',
                  border: `1px solid ${theme.border}`,
                  fontSize: '13px', fontWeight: '700', color: theme.text,
                }}>
                  RSI Verdict: <span style={{ color: stock.verdict === 'Bargain' ? '#34d399' : stock.verdict === 'Expensive' ? '#f87171' : theme.accent }}>
                    {stock.verdict}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;