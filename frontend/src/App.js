import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend, ComposedChart, PieChart, Pie, Cell 
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // --- INTERNAL COMPONENTS (Fixed Scoping) ---
  const SkeletonCard = () => (
    <div style={{ ...cardStyle, width: '100%', backgroundColor: theme.card, backdropFilter: theme.glass, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div className="skeleton-pulse" style={{ width: '80px', height: '25px', borderRadius: '8px', backgroundColor: theme.inputBg }}></div>
        <div className="skeleton-pulse" style={{ width: '100px', height: '25px', borderRadius: '8px', backgroundColor: theme.inputBg }}></div>
      </div>
      <div className="skeleton-pulse" style={{ width: '60%', height: '35px', borderRadius: '8px', backgroundColor: theme.inputBg, marginBottom: '15px' }}></div>
      <div className="skeleton-pulse" style={{ width: '100%', height: '80px', borderRadius: '15px', backgroundColor: theme.inputBg }}></div>
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

  // --- LOGIC (Preserved Exactly) ---
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchRiskAnalysis = (username) => {
    fetch(`${API_BASE}/api/portfolio-analysis/${username}`)
      .then(res => res.json())
      .then(data => { 
        if(!data.error) {
          setRiskData(data);
          const sectors = {};
          portfolio.forEach(item => {
            const sec = item.sector || "Other";
            sectors[sec] = (sectors[sec] || 0) + (item.qty * item.avgPrice);
          });
          setSectorData(Object.keys(sectors).map(key => ({ name: key, value: sectors[key] })));
        }
      });
  };

  const handleAuth = () => {
    const endpoint = isRegistering ? "register" : "login";
    fetch(`${API_BASE}/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isRegistering ? { 
        username: loginForm.username, 
        password: loginForm.password, 
        balance: parseFloat(loginForm.initial_balance) 
      } : loginForm)
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        if (isRegistering) {
          alert("Registration successful! Please login.");
          setIsRegistering(false);
        } else {
          setUser(data.user);
          setBalance(data.balance);
          setPortfolio(data.portfolio);
          setShowLogin(false);
          fetchRiskAnalysis(data.user);
        }
      } else { alert(data.message); }
    });
  };

  const handleSetHolding = (stock) => {
    if (!user) { setShowLogin(true); return; }
    const qty = prompt(`Quantity of ${stock.symbol} owned:`, "1");
    if (!qty || isNaN(qty)) return;
    const avgP = prompt(`Average Buy Price for ${stock.symbol}:`, stock.price);
    if (!avgP || isNaN(avgP)) return;

    fetch(`${API_BASE}/api/update-holding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user, symbol: stock.symbol,
        qty: parseInt(qty), avgPrice: parseFloat(avgP)
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setPortfolio(data.portfolio);
        fetchRiskAnalysis(user);
      }
    });
  };

  const handleRemoveHolding = (symbol) => {
    if(!window.confirm(`Remove ${symbol}?`)) return;
    fetch(`${API_BASE}/api/remove-holding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, symbol })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setPortfolio(data.portfolio);
        fetchRiskAnalysis(user);
      }
    });
  };

  const handleSearch = (val, target) => {
    if (target === 't1') setT1(val); else setT2(val);
    setActiveInput(target);
    if (val.length > 1) {
      fetch(`${API_BASE}/api/search/${val}`)
        .then(res => res.json())
        .then(data => { setSuggestions(data); setShowDropdown(true); });
    } else { setShowDropdown(false); }
  };

  const handleAction = (manualTicker = null) => {
    const ticker1 = (manualTicker || t1).trim().toUpperCase();
    const ticker2 = t2.trim().toUpperCase();
    if (!ticker1) return;
    if (mode === "compare" && !manualTicker && !ticker2) {
      alert("Please enter a second ticker for comparison.");
      return;
    }
    setLoading(true); 
    setResults([]); 
    setComparisonData(null); 
    setShowDropdown(false);

    const url = (mode === "analyze" || manualTicker)
      ? `${API_BASE}/api/analyze/${ticker1}`
      : `${API_BASE}/api/compare/${ticker1}/${ticker2}`;

    fetch(url)
      .then(res => {
        if (res.status === 429) {
          alert("Rate limited by Yahoo Finance. Please wait 10 minutes.");
          throw new Error("Rate limit");
        }
        return res.json();
      })
      .then(data => {
        if (data.stocks) {
          setResults(data.stocks);
          setComparisonData({ winner: data.winner, verdict: data.verdict });
        } else if (data.symbol) {
          setResults([data]); 
        } else {
          setResults([]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Fetch error:", err);
        setLoading(false);
      });
  };

  const downloadPDF = () => {
    if (results.length === 0) return;
    const doc = new jsPDF();
    doc.setFontSize(22); doc.text("FinSight Terminal Report", 14, 20);
    autoTable(doc, {
      startY: 35,
      head: [['Symbol', 'Price', 'P/E', 'Sharpe', 'Risk', 'Verdict']],
      body: results.map(s => [s.symbol, `INR ${s.price}`, s.pe_ratio, s.sharpe, s.risk, s.recommendation]),
      headStyles: { fillColor: [56, 189, 248] }
    });
    doc.save(`FinSight_Report.pdf`);
  };

  return (
    <>
      <style>{`
        .sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 240px; padding: 40px 25px; z-index: 100; overflow-y: auto; }
        .main-content { padding-left: 280px; padding-top: 60px; padding-right: 40px; padding-bottom: 60px; min-height: 100vh; transition: 0.3s; }
        .search-container { display: flex; justify-content: center; gap: 12px; margin-bottom: 60px; align-items: center; }
        .search-input-wrapper { position: relative; width: 200px; }
        .stock-card { width: 460px; padding: 35px; border-radius: 35px; margin-bottom: 30px; }
        @media (max-width: 900px) {
          .sidebar { position: relative; width: 100%; height: auto; border-right: none !important; border-bottom: 1px solid #30363d; padding: 25px; }
          .main-content { padding-left: 20px; padding-right: 20px; padding-top: 30px; }
          .search-container { flex-direction: column; align-items: center; width: 100%; }
          .search-input-wrapper { width: 100% !important; }
          .stock-card { width: 100% !important; }
        }
      `}</style>

      {showLogin && (
        <div style={overlayStyle}>
          <div style={{ ...loginCardStyle, backgroundColor: theme.card, backdropFilter: theme.glass, border: `1px solid ${theme.border}` }}>
            <button onClick={() => setShowLogin(false)} style={closeBtnStyle}>✕</button>
            <h2 style={{ color: theme.accent, margin: '0 0 5px 0', fontSize: '28px', fontWeight: '800' }}>Join FinSight</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left', marginTop: '20px' }}>
                <input style={{ ...inputStyle, width: '100%', backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }} placeholder="Username" onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} />
                <input type="password" style={{ ...inputStyle, width: '100%', backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }} placeholder="Password" onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
            </div>
            <button style={{ ...mainBtn, width: '100%', marginTop: '30px' }} onClick={handleAuth}>{isRegistering ? "Create Profile" : "Access Terminal"}</button>
          </div>
        </div>
      )}

      <div style={{ backgroundColor: theme.bg, color: theme.text }} className="main-content">
        <div style={{ backgroundColor: theme.sidebar, borderRight: `1px solid ${theme.border}`, backdropFilter: theme.glass }} className="sidebar">
          <h2 style={{ fontSize: '22px', margin: 0, color: theme.accent, fontWeight: '800', letterSpacing: '-1px' }}>FinSight</h2>
          {user ? (
            <div style={{ margin: '20px 0', padding: '20px', backgroundColor: theme.inputBg, borderRadius: '18px', border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '10px', color: theme.subText, fontWeight: 'bold' }}>NET WORTH</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: theme.accent }}>₹{balance.toLocaleString()}</div>
              <button onClick={() => { setUser(null); }} style={logoutBtnStyle}>Sign Out</button>
            </div>
          ) : (
            <button onClick={() => setShowLogin(true)} style={{ ...mainBtn, padding: '12px', fontSize: '12px', width: '100%', margin: '25px 0' }}>🔑 Member Login</button>
          )}
          <h4 style={{ fontSize: '11px', color: theme.subText, letterSpacing: '1.5px', marginBottom: '15px', fontWeight: 'bold' }}>WATCHLIST</h4>
          <div className="watchlist-container">
            {watchlist.map(symbol => (
              <div key={symbol} style={watchlistItemWrapper} className="watchlist-item-wrapper">
                <div style={{ ...watchlistItem, backgroundColor: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}` }} onClick={() => { setT1(symbol); handleAction(symbol); }}>{symbol}</div>
                <button style={removeBtn} onClick={() => setWatchlist(prev => prev.filter(s => s !== symbol))}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={downloadPDF} style={pdfBtnStyle}>Export Intelligence</button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} style={themeToggleStyle}>{isDarkMode ? "☀️ Light UI" : "🌙 Dark UI"}</button>
          </div>
        </div>

        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
            <h1 style={{ color: theme.text, fontSize: '42px', fontWeight: '900', margin: 0, letterSpacing: '-1.5px' }}>Terminal</h1>
            <button onClick={() => setMode("portfolio")} style={{ ...inactiveTabStyle, backgroundColor: theme.inputBg, borderRadius: '16px', padding: '12px 28px', border: `1px solid ${theme.border}`, fontWeight: '800' }}>💼 My Portfolio</button>
          </div>
          
          <div style={{ marginBottom: '40px', textAlign: 'center' }}>
            <div style={{ ...modeTabContainer, backgroundColor: 'rgba(100,116,139,0.1)' }}>
              <button onClick={() => { setMode("analyze"); setResults([]); }} style={mode === "analyze" ? activeTabStyle : { ...inactiveTabStyle, color: theme.subText }}>Single Analyze</button>
              <button onClick={() => { setMode("compare"); setResults([]); }} style={mode === "compare" ? activeTabStyle : { ...inactiveTabStyle, color: theme.subText }}>Head-to-Head</button>
            </div>
          </div>

          <div className="search-container" ref={dropdownRef}>
            <div className="search-input-wrapper">
              <input placeholder={mode === "compare" ? "Ticker 1" : "Ticker"} value={t1} onChange={(e) => handleSearch(e.target.value, 't1')} style={{ ...inputStyle, width: '100%', backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }} />
              {showDropdown && activeInput === 't1' && <SuggestionsList suggestions={suggestions} onSelect={(s) => { setT1(s); setShowDropdown(false); }} />}
            </div>
            {mode === "compare" && (
              <div className="search-input-wrapper">
                <input placeholder="Ticker 2" value={t2} onChange={(e) => handleSearch(e.target.value, 't2')} style={{ ...inputStyle, width: '100%', backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }} />
                {showDropdown && activeInput === 't2' && <SuggestionsList suggestions={suggestions} onSelect={(s) => { setT2(s); setShowDropdown(false); }} />}
              </div>
            )}
            <button onClick={() => handleAction()} style={{ ...mainBtn, height: '48px', padding: '0 25px', fontSize: '13px' }}>{loading ? "..." : "ANALYZE"}</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '35px', flexWrap: 'wrap' }}>
            {loading && <SkeletonCard />}
            {results.map((stock, i) => {
              const statusColor = stock.risk === "High" ? "#f87171" : stock.risk === "Medium" ? "#fbbf24" : "#34d399";
              return (
                <div key={i} className="stock-card" style={{ ...cardStyle, backgroundColor: theme.card, backdropFilter: theme.glass, border: `1px solid ${theme.border}`, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ ...badgeStyle, backgroundColor: `${statusColor}22`, color: statusColor }}>{stock.recommendation}</div>
                    <button onClick={() => handleSetHolding(stock)} style={tradeBtn}>Sync Holding</button>
                  </div>
                  <h2 style={{margin:0, fontSize: '32px', fontWeight: '900', letterSpacing: '-1px'}}>{stock.symbol}</h2>
                  <div style={aiBox}><p style={{ margin: 0, fontSize: '13px', color: theme.text, lineHeight: '1.6' }}>{stock.ai_summary}</p></div>
                  <h1 style={{ color: theme.text, margin: '25px 0 10px 0', fontSize: '56px', fontWeight: '900', letterSpacing: '-2px' }}>₹{stock.price}</h1>

                  {/* RESTORED COMPOSED CHART LOGIC */}
                  <div style={{ width: '100%', height: 240, margin: '20px 0' }}>
                    <ResponsiveContainer>
                      <ComposedChart data={stock.history}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#30363d" : "#e1e4e8"} />
                        <XAxis dataKey="date" hide /><YAxis domain={['auto', 'auto']} hide />
                        <Tooltip contentStyle={{ backgroundColor: theme.card, borderRadius: '12px', border: `1px solid ${theme.border}`, color: theme.text }} />
                        <Legend verticalAlign="top" height={36}/>
                        <Line name="Price" type="monotone" dataKey="price" stroke={statusColor} strokeWidth={4} dot={false} />
                        <Line name="20-Day SMA" type="monotone" dataKey="sma" stroke={isDarkMode ? "#8b949e" : "#64748b"} strokeWidth={2} dot={false} strokeDasharray="3 3" />
                        <Line name="Volume Trend" type="monotone" dataKey="vpt" stroke="#a855f7" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={gridContainer} className="grid-stats">
                    <div style={{ ...gridBox, backgroundColor: theme.inputBg }}><span style={gridTitle}>GROWTH</span><br/><span style={{fontWeight:'bold', color: stock.return > 0 ? '#34d399' : '#f87171'}}>{stock.return}%</span></div>
                    <div style={{ ...gridBox, backgroundColor: theme.inputBg }}><span style={gridTitle}>P/E</span><br/><span style={{fontWeight:'bold'}}>{stock.pe_ratio}</span></div>
                    <div title="Beta measures sensitivity to market movements." style={{ ...gridBox, backgroundColor: theme.inputBg, cursor: 'help' }}><span style={gridTitle}>BETA</span><br/><span style={{fontWeight:'bold'}}>1.21</span></div>
                    <div title="Sharpe Ratio measures risk-adjusted return." style={{ ...gridBox, backgroundColor: theme.inputBg, cursor: 'help' }}><span style={gridTitle}>SHARPE</span><br/><span style={{fontWeight:'bold'}}>{stock.sharpe}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// --- STYLES (Preserved Exactly) ---
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(8px)' };
const loginCardStyle = { padding: '50px', borderRadius: '32px', width: '420px', textAlign: 'center', position: 'relative' };
const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '800', color: '#8b949e', textTransform: 'uppercase', marginBottom: '5px', marginLeft: '5px' };
const closeBtnStyle = { position: 'absolute', top: '25px', right: '25px', background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '20px' };
const logoutBtnStyle = { background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', border: 'none', padding: '8px 15px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginTop: '15px' };
const riskCardStyle = { flex: 1, padding: '25px', borderRadius: '24px', textAlign: 'center', minWidth: '200px' };
const deleteBtnStyle = { background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '16px', padding: '10px' };
const tradeBtn = { padding: '8px 18px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '12px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' };
const watchlistItemWrapper = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' };
const watchlistItem = { padding: '14px', borderRadius: '14px', cursor: 'pointer', fontWeight: '800', fontSize: '13px', flex: 1 };
const removeBtn = { background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 'bold' };
const inputStyle = { padding: '10px 20px', borderRadius: '15px', outline: 'none', border: '2px solid transparent', transition: '0.3s', fontSize: '14px', fontWeight: '600' };
const mainBtn = { padding: '15px 35px', backgroundColor: '#38bdf8', color: 'white', border: 'none', borderRadius: '18px', fontWeight: '800', cursor: 'pointer' };
const modeTabContainer = { display: 'inline-flex', padding: '6px', borderRadius: '18px' };
const activeTabStyle = { padding: '12px 24px', backgroundColor: '#ffffff', color: '#1a1d23', border: 'none', borderRadius: '14px', fontWeight: '800', cursor: 'pointer' };
const inactiveTabStyle = { padding: '12px 24px', backgroundColor: 'transparent', border: 'none', borderRadius: '14px', fontWeight: '700', cursor: 'pointer' };
const cardStyle = { padding: '35px', borderRadius: '35px', width: '460px', textAlign: 'left' };
const aiBox = { padding: '20px', borderRadius: '22px', marginTop: '15px', backgroundColor: 'rgba(100,116,139,0.05)' };
const gridContainer = { display: 'flex', gap: '15px', marginTop: '25px' };
const gridBox = { flex: 1, padding: '18px', borderRadius: '20px', textAlign: 'center' };
const gridTitle = { fontSize: '9px', color: '#8b949e', display: 'block', marginBottom: '6px', fontWeight: '900', letterSpacing: '1px' };
const badgeStyle = { padding: '8px 16px', borderRadius: '12px', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase' };
const themeToggleStyle = { width: '100%', padding: '14px', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '800', background: 'linear-gradient(135deg, #1a1d23 0%, #38bdf8 100%)', color: 'white', fontSize: '12px' };
const pdfBtnStyle = { width: '100%', padding: '14px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '14px', fontWeight: '800', cursor: 'pointer', fontSize: '12px' };
const dropdownStyle = { position: 'absolute', top: '55px', width: '100%', zIndex: 1000, listStyle: 'none', padding: '10px', borderRadius: '20px' };
const suggestionItem = { padding: '14px', cursor: 'pointer', borderRadius: '12px' };

export default App;