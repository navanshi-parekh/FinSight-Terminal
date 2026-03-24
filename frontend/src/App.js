import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend, ComposedChart, PieChart, Pie, Cell 
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- PRODUCTION API URL ---
const API_BASE = "https://finsight-api-r9d6.onrender.com";

function App() {
  const [mode, setMode] = useState("analyze"); 
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");
  const [results, setResults] = useState([]);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeInput, setActiveInput] = useState(null); 
  const dropdownRef = useRef(null);

  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [portfolio, setPortfolio] = useState([]);
  const [riskData, setRiskData] = useState(null);
  const [sectorData, setSectorData] = useState([]); 
  const [loginForm, setLoginForm] = useState({ username: '', password: '', initial_balance: 1000000 });
  const [showLogin, setShowLogin] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const COLORS = ['#38bdf8', '#10b981', '#a855f7', '#f59e0b', '#f87171', '#6366f1'];

  const theme = {
    bg: isDarkMode ? '#0d1117' : '#f0f2f5',
    card: isDarkMode ? '#161b22cc' : '#ffffffcc', 
    text: isDarkMode ? '#f0f6fc' : '#1a1d23',
    subText: isDarkMode ? '#8b949e' : '#64748b',
    border: isDarkMode ? '#30363d' : '#e1e4e8',
    sidebar: isDarkMode ? '#010409' : '#ffffff',
    inputBg: isDarkMode ? '#0d1117' : '#f8fafc',
    accent: '#38bdf8',
    glass: 'blur(12px)'
  };

  // Internal Components to fix the 'theme' crash on Render
  const SkeletonCard = () => (
    <div style={{ ...cardStyle, width: '460px', backgroundColor: theme.card, backdropFilter: theme.glass, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div className="skeleton-pulse" style={{ width: '80px', height: '25px', borderRadius: '8px', backgroundColor: theme.inputBg }}></div>
        <div className="skeleton-pulse" style={{ width: '100px', height: '25px', borderRadius: '8px', backgroundColor: theme.inputBg }}></div>
      </div>
      <div className="skeleton-pulse" style={{ width: '100%', height: '150px', borderRadius: '15px', backgroundColor: theme.inputBg }}></div>
      <style>{`@keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } } .skeleton-pulse { animation: pulse 1.5s infinite ease-in-out; }`}</style>
    </div>
  );

  const SuggestionsList = ({ suggestions, onSelect }) => (
    <ul style={{ ...dropdownStyle, backgroundColor: theme.card, border: `1px solid ${theme.border}`, backdropFilter: 'blur(10px)' }}>
      {suggestions.map((s, idx) => (
        <li key={idx} onClick={() => onSelect(s.symbol)} style={{ ...suggestionItem, color: theme.text, borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{s.symbol}</div>
          <div style={{ fontSize: '11px', color: theme.subText }}>{s.name}</div>
        </li>
      ))}
    </ul>
  );

  useEffect(() => {
    const saved = localStorage.getItem("stock_watchlist");
    if (saved) setWatchlist(JSON.parse(saved));
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") setIsDarkMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("stock_watchlist", JSON.stringify(watchlist));
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [watchlist, isDarkMode]);

  const handleSearch = (val, target) => {
    if (target === 't1') setT1(val); else setT2(val);
    setActiveInput(target);
    if (val.length > 1) {
      fetch(`${API_BASE}/api/search/${val}`).then(res => res.json()).then(data => { setSuggestions(data); setShowDropdown(true); });
    } else { setShowDropdown(false); }
  };

  const handleAction = (manualTicker = null) => {
    const ticker1 = (manualTicker || t1).trim().toUpperCase();
    const ticker2 = t2.trim().toUpperCase();
    if (!ticker1) return;
    setLoading(true); setResults([]); setComparisonData(null); setShowDropdown(false);
    const url = (mode === "analyze" || manualTicker) ? `${API_BASE}/api/analyze/${ticker1}` : `${API_BASE}/api/compare/${ticker1}/${ticker2}`;
    fetch(url).then(res => res.json()).then(data => {
        if (data.stocks) { setResults(data.stocks); setComparisonData({ winner: data.winner, verdict: data.verdict }); } 
        else if (data.symbol) { setResults([data]); }
        setLoading(false);
      }).catch(() => setLoading(false));
  };

  const downloadPDF = () => {
    const doc = new jsPDF(); doc.text("FinSight Report", 14, 20);
    autoTable(doc, { head: [['Symbol', 'Price', 'Verdict']], body: results.map(s => [s.symbol, s.price, s.recommendation]) });
    doc.save(`FinSight_Report.pdf`);
  };

  return (
    <div style={{ backgroundColor: theme.bg, color: theme.text, minHeight: '100vh', transition: '0.3s' }}>
      <style>{`
        .sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 240px; padding: 40px 25px; z-index: 100; border-right: 1px solid ${theme.border}; background: ${theme.sidebar}; backdrop-filter: ${theme.glass}; }
        .main-content { padding-left: 280px; padding-top: 60px; padding-right: 40px; padding-bottom: 60px; }
        
        /* FIX FOR BLOTCHED OVERLAP */
        .search-area { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 60px; flex-wrap: nowrap; }
        .input-box-wrap { position: relative; width: 180px; flex-shrink: 0; }
        
        @media (max-width: 900px) {
          .sidebar { position: relative; width: 100%; height: auto; border-right: none; border-bottom: 1px solid ${theme.border}; padding: 25px; }
          .main-content { padding-left: 20px; padding-right: 20px; }
          .search-area { flex-direction: column; }
          .input-box-wrap { width: 100%; }
        }
      `}</style>

      {/* Sidebar */}
      <div className="sidebar">
        <h2 style={{ color: theme.accent, fontWeight: '800', margin: '0 0 30px 0' }}>FinSight</h2>
        {user ? (
          <div style={{ margin: '20px 0', padding: '20px', backgroundColor: theme.inputBg, borderRadius: '18px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '10px', color: theme.subText }}>NET WORTH</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: theme.accent }}>₹{balance.toLocaleString()}</div>
          </div>
        ) : (
          <button onClick={() => setShowLogin(true)} style={{ ...mainBtn, width: '100%', margin: '25px 0' }}>🔑 Login</button>
        )}
        <h4 style={{ fontSize: '11px', color: theme.subText, marginBottom: '15px', fontWeight: 'bold' }}>WATCHLIST</h4>
        {watchlist.map(s => (
          <div key={s} style={watchlistItemWrapper} onClick={() => handleAction(s)}>
            <div style={{ ...watchlistItem, backgroundColor: theme.inputBg }}>{s}</div>
          </div>
        ))}
        <div style={{ position: 'absolute', bottom: '25px', left: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={downloadPDF} style={pdfBtnStyle}>Export Intelligence</button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} style={themeToggleStyle}>{isDarkMode ? "☀️ Light UI" : "🌙 Dark UI"}</button>
        </div>
      </div>

      <div className="main-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '42px', fontWeight: '900', margin: 0 }}>Terminal</h1>
          <button onClick={() => setMode("portfolio")} style={inactiveTabStyle}>💼 Portfolio</button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ ...modeTabContainer, backgroundColor: 'rgba(100,116,139,0.1)' }}>
            <button onClick={() => setMode("analyze")} style={mode === "analyze" ? activeTabStyle : inactiveTabStyle}>Single Analyze</button>
            <button onClick={() => setMode("compare")} style={mode === "compare" ? activeTabStyle : inactiveTabStyle}>Head-to-Head</button>
          </div>
        </div>

        {/* --- FIXED SEARCH BAR --- */}
        <div className="search-area" ref={dropdownRef}>
          <div className="input-box-wrap">
            <input placeholder="Ticker 1" value={t1} onChange={e => handleSearch(e.target.value, 't1')} style={{ ...inputStyle, width: '100%', backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }} />
            {showDropdown && activeInput === 't1' && <SuggestionsList suggestions={suggestions} onSelect={s => { setT1(s); setShowDropdown(false); }} />}
          </div>
          {mode === "compare" && (
            <div className="input-box-wrap">
              <input placeholder="Ticker 2" value={t2} onChange={e => handleSearch(e.target.value, 't2')} style={{ ...inputStyle, width: '100%', backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }} />
              {showDropdown && activeInput === 't2' && <SuggestionsList suggestions={suggestions} onSelect={s => { setT2(s); setShowDropdown(false); }} />}
            </div>
          )}
          <button onClick={() => handleAction()} style={mainBtn}>{loading ? "..." : "ANALYZE"}</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '35px', flexWrap: 'wrap' }}>
          {loading && <SkeletonCard />}
          {results.map((stock, i) => {
            const statusColor = stock.risk === "High" ? "#f87171" : stock.risk === "Medium" ? "#fbbf24" : "#34d399";
            return (
              <div key={i} className="stock-card" style={{ ...cardStyle, backgroundColor: theme.card, border: `1px solid ${theme.border}`, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ ...badgeStyle, backgroundColor: `${statusColor}22`, color: statusColor }}>{stock.recommendation}</div>
                  <button onClick={() => setWatchlist([...watchlist, stock.symbol])} style={{ background: 'none', border: 'none', fontSize: '20px', color: theme.accent }}>☆</button>
                </div>
                <h2 style={{ fontSize: '32px', fontWeight: '900', margin: 0 }}>{stock.symbol}</h2>
                <div style={aiBox}><p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6' }}>{stock.ai_summary}</p></div>
                <h1 style={{ color: theme.text, margin: '25px 0 10px 0', fontSize: '56px', fontWeight: '900' }}>₹{stock.price}</h1>
                
                {/* --- GRAPH RESTORED --- */}
                <div style={{ width: '100%', height: 240, margin: '20px 0' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={stock.history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.border} />
                      <XAxis dataKey="date" hide /><YAxis domain={['auto', 'auto']} hide />
                      <Tooltip contentStyle={{ background: theme.card, borderRadius: '12px' }} />
                      <Legend verticalAlign="top" height={36}/>
                      <Line name="Price" type="monotone" dataKey="price" stroke={theme.accent} strokeWidth={4} dot={false} />
                      <Line name="20-Day SMA" type="monotone" dataKey="sma" stroke="#8b949e" strokeWidth={2} dot={false} strokeDasharray="3 3" />
                      <Line name="Volume Trend" type="monotone" dataKey="vpt" stroke="#a855f7" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div style={gridContainer}>
                  <div style={{ ...gridBox, backgroundColor: theme.inputBg }}>GROWTH<br/><b>{stock.return}%</b></div>
                  <div style={{ ...gridBox, backgroundColor: theme.inputBg }}>SHARPE<br/><b>{stock.sharpe}</b></div>
                  <div style={{ ...gridBox, backgroundColor: theme.inputBg }}>RISK<br/><b>{stock.risk}</b></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// STYLES
const cardStyle = { padding: '35px', borderRadius: '35px', width: '460px', textAlign: 'left' };
const aiBox = { padding: '20px', borderRadius: '22px', marginTop: '15px', backgroundColor: 'rgba(100,116,139,0.05)' };
const gridContainer = { display: 'flex', gap: '15px', marginTop: '25px' };
const gridBox = { flex: 1, padding: '18px', borderRadius: '20px', textAlign: 'center' };
const gridTitle = { fontSize: '9px', color: '#8b949e', display: 'block', marginBottom: '6px', fontWeight: '900' };
const inputStyle = { padding: '10px 20px', borderRadius: '15px', outline: 'none', border: '2px solid transparent', fontSize: '14px' };
const mainBtn = { padding: '15px 35px', backgroundColor: '#38bdf8', color: 'white', border: 'none', borderRadius: '18px', fontWeight: '800', cursor: 'pointer' };
const activeTabStyle = { padding: '12px 24px', backgroundColor: '#ffffff', color: '#1a1d23', borderRadius: '14px', border: 'none', fontWeight: '800' };
const inactiveTabStyle = { padding: '12px 24px', backgroundColor: 'transparent', border: 'none', fontWeight: '700' };
const modeTabContainer = { display: 'inline-flex', padding: '6px', borderRadius: '18px' };
const watchlistItemWrapper = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', cursor: 'pointer' };
const watchlistItem = { padding: '14px', borderRadius: '14px', flex: 1, fontWeight: '800' };
const themeToggleStyle = { width: '100%', padding: '14px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'linear-gradient(135deg, #1a1d23 0%, #38bdf8 100%)', color: 'white' };
const pdfBtnStyle = { width: '100%', padding: '14px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '14px' };
const badgeStyle = { padding: '8px 16px', borderRadius: '12px', fontSize: '11px', fontWeight: '900' };
const dropdownStyle = { position: 'absolute', top: '55px', width: '100%', zIndex: 1000, listStyle: 'none', padding: '10px', borderRadius: '20px' };
const suggestionItem = { padding: '14px', cursor: 'pointer', borderRadius: '12px' };
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(8px)' };
const loginCardStyle = { padding: '50px', borderRadius: '32px', width: '420px', textAlign: 'center' };
const closeBtnStyle = { position: 'absolute', top: '25px', right: '25px', background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '20px' };

export default App;