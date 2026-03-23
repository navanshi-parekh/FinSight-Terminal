import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend, ComposedChart, PieChart, Pie, Cell 
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- ADDED FOR DEPLOYMENT ---
const API_BASE = window.location.hostname === "localhost" 
  ? "http://127.0.0.1:8000" 
  : "https://finsight-api-r9d6.onrender.com"; 

// --- NEW COMPONENT: LOADING SKELETON ---
const SkeletonCard = ({ theme }) => (
  <div style={{ ...cardStyle, backgroundColor: theme.card, backdropFilter: theme.glass, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
      <div className="skeleton-pulse" style={{ width: '80px', height: '25px', borderRadius: '8px', backgroundColor: theme.inputBg }}></div>
      <div className="skeleton-pulse" style={{ width: '100px', height: '25px', borderRadius: '8px', backgroundColor: theme.inputBg }}></div>
    </div>
    <div className="skeleton-pulse" style={{ width: '60%', height: '35px', borderRadius: '8px', backgroundColor: theme.inputBg, marginBottom: '15px' }}></div>
    <div className="skeleton-pulse" style={{ width: '100%', height: '80px', borderRadius: '15px', backgroundColor: theme.inputBg }}></div>
    <div className="skeleton-pulse" style={{ width: '40%', height: '50px', borderRadius: '8px', backgroundColor: theme.inputBg, marginTop: '25px' }}></div>
    <div style={{ ...gridContainer, marginTop: '25px' }}>
      {[1, 2, 3, 4].map(i => <div key={i} className="skeleton-pulse" style={{ flex: 1, height: '60px', borderRadius: '15px', backgroundColor: theme.inputBg }}></div>)}
    </div>
    <style>{`
      @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
      .skeleton-pulse { animation: pulse 1.5s infinite ease-in-out; }
    `}</style>
  </div>
);

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

  // --- REVISED AUTH & PREDICTION STATE ---
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [portfolio, setPortfolio] = useState([]);
  const [riskData, setRiskData] = useState(null);
  const [sectorData, setSectorData] = useState([]); // NEW: State for Pie Chart
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
          // Calculate Sector Data for Pie Chart
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

  const handleTrade = (stock) => {
    if (!user) { setShowLogin(true); return; }
    const qty = prompt(`Add ${stock.symbol} to your holdings (Quantity):`, "1");
    if (!qty || isNaN(qty)) return;

    fetch(`${API_BASE}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user, symbol: stock.symbol, qty: parseInt(qty),
        price: stock.price, action: "buy"
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setBalance(data.balance);
        setPortfolio(data.portfolio);
        fetchRiskAnalysis(user);
        alert(`Holding updated for ${stock.symbol}`);
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
    setLoading(true); setResults([]); setComparisonData(null); setShowDropdown(false);
    const url = mode === "analyze" || manualTicker
      ? `${API_BASE}/api/analyze/${ticker1}`
      : `${API_BASE}/api/compare/${ticker1}/${ticker2}`;
    fetch(url).then(res => res.json()).then(data => {
      if (data.stocks) {
        setResults(data.stocks);
        setComparisonData({ winner: data.winner, verdict: data.verdict });
      } else { setResults(Array.isArray(data) ? data : [data]); }
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const downloadPDF = () => {
    if (results.length === 0) return;
    const doc = new jsPDF();
    doc.setFontSize(22); doc.text("FinSight Terminal Report", 14, 20);
    autoTable(doc, {
      startY: 35,
      head: [['Symbol', 'Price', 'P/E', 'D/E', 'Sharpe', 'Risk', 'Verdict']],
      body: results.map(s => [s.symbol, `INR ${s.price}`, s.pe_ratio, s.debt_equity, s.sharpe, s.risk, s.recommendation]),
      headStyles: { fillColor: [56, 189, 248] }
    });
    doc.save(`FinSight_Report.pdf`);
  };

  return (
    <>
      {showLogin && (
        <div style={overlayStyle}>
          <div style={{ ...loginCardStyle, backgroundColor: theme.card, backdropFilter: theme.glass, border: `1px solid ${theme.border}` }}>
            <button onClick={() => setShowLogin(false)} style={closeBtnStyle}>✕</button>
            <div style={{ marginBottom: '30px' }}>
              <h2 style={{ color: theme.accent, margin: '0 0 5px 0', fontSize: '28px', fontWeight: '800' }}>
                {isRegistering ? "Join FinSight" : "Welcome Back"}
              </h2>
              <p style={{ color: theme.subText, fontSize: '13px', margin: 0 }}>
                {isRegistering ? "Create your institutional-grade profile" : "Unlock your predictive portfolio analytics"}
              </p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left' }}>
                <div>
                    <label style={labelStyle}>Username</label>
                    <input style={{ ...inputStyle, width: '100%', backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }} placeholder="e.g. Navanshi" onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} />
                </div>
                <div>
                    <label style={labelStyle}>Password</label>
                    <input type="password" style={{ ...inputStyle, width: '100%', backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }} placeholder="••••••••" onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
                </div>
                {isRegistering && (
                    <div>
                        <label style={labelStyle}>Initial Capital (INR)</label>
                        <input type="number" style={{ ...inputStyle, width: '100%', backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }} value={loginForm.initial_balance} onChange={e => setLoginForm({ ...loginForm, initial_balance: e.target.value })} />
                    </div>
                )}
            </div>

            <button style={{ ...mainBtn, width: '100%', marginTop: '30px', boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)' }} onClick={handleAuth}>
              {isRegistering ? "Create Profile" : "Access Terminal"}
            </button>

            <p style={{ fontSize: '13px', color: theme.subText, marginTop: '20px' }}>
              {isRegistering ? "Already have a profile?" : "New to the platform?"} 
              <span onClick={() => setIsRegistering(!isRegistering)} style={{ color: theme.accent, cursor: 'pointer', marginLeft: '8px', fontWeight: 'bold' }}>
                {isRegistering ? "Sign In" : "Register Now"}
              </span>
            </p>
          </div>
        </div>
      )}

      <div style={{ ...containerStyle, backgroundColor: theme.bg, color: theme.text }}>
        <div style={{ ...watchlistSidebar, backgroundColor: theme.sidebar, borderRight: `1px solid ${theme.border}`, backdropFilter: theme.glass }}>
          <div style={{ padding: '0 0 20px 0', borderBottom: `1px solid ${theme.border}`, marginBottom: '20px' }}>
            <h2 style={{ fontSize: '22px', margin: 0, color: theme.accent, fontWeight: '800', letterSpacing: '-1px' }}>FinSight</h2>
            <p style={{ fontSize: '10px', color: theme.subText, margin: 0, fontWeight: 'bold', textTransform: 'uppercase' }}>Predictive Engine v2.0</p>
          </div>

          {user ? (
            <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: theme.inputBg, borderRadius: '18px', border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '10px', color: theme.subText, fontWeight: 'bold', marginBottom: '5px' }}>NET WORTH</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: theme.accent }}>₹{balance.toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: theme.subText, marginTop: '8px' }}>Active: {user}</div>
              <button onClick={() => { setUser(null); setMode("analyze"); }} style={logoutBtnStyle}>Sign Out</button>
            </div>
          ) : (
            <button onClick={() => setShowLogin(true)} style={{ ...mainBtn, padding: '12px', fontSize: '12px', width: '100%', marginBottom: '25px', backgroundColor: theme.accent }}>🔑 Member Login</button>
          )}

          <h4 style={{ fontSize: '11px', color: theme.subText, letterSpacing: '1.5px', marginBottom: '15px', fontWeight: 'bold' }}>WATCHLIST</h4>
          <div style={{ maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
            {watchlist.map(symbol => (
              <div key={symbol} style={watchlistItemWrapper}>
                <div style={{ ...watchlistItem, backgroundColor: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}` }} onClick={() => { setT1(symbol); setMode("analyze"); handleAction(symbol); }}>{symbol}</div>
                <button style={removeBtn} onClick={() => setWatchlist(prev => prev.filter(s => s !== symbol))}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', bottom: '25px', left: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={downloadPDF} style={pdfBtnStyle}>Export Intelligence</button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} style={themeToggleStyle}>{isDarkMode ? "☀️ Light UI" : "🌙 Dark UI"}</button>
          </div>
        </div>

        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
            <h1 style={{ color: theme.text, fontSize: '42px', fontWeight: '900', margin: 0, letterSpacing: '-1.5px' }}>Terminal</h1>
            <button onClick={() => { setMode("portfolio"); if(user) fetchRiskAnalysis(user); }} 
                    style={{ ...mode === "portfolio" ? activeTabStyle : inactiveTabStyle, 
                    backgroundColor: mode === "portfolio" ? theme.accent : 'rgba(100,116,139,0.05)', 
                    color: mode === "portfolio" ? '#fff' : theme.text, borderRadius: '16px', padding: '12px 28px', border: `1px solid ${theme.border}`,
                    display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800', cursor: 'pointer', transition: '0.2s' }}>
              💼 My Portfolio
            </button>
          </div>
          
          <div style={{ marginBottom: '40px', textAlign: 'center' }}>
            <div style={{ ...modeTabContainer, backgroundColor: 'rgba(100,116,139,0.1)' }}>
              <button onClick={() => { setMode("analyze"); setResults([]); }} style={mode === "analyze" ? activeTabStyle : { ...inactiveTabStyle, color: theme.subText }}>Single Analyze</button>
              <button onClick={() => { setMode("compare"); setResults([]); }} style={mode === "compare" ? activeTabStyle : { ...inactiveTabStyle, color: theme.subText }}>Head-to-Head</button>
            </div>
          </div>

          {mode !== "portfolio" ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ marginBottom: '60px', display: 'flex', justifyContent: 'center', gap: '12px' }} ref={dropdownRef}>
                <div style={{ position: 'relative' }}>
                  <input placeholder="Ticker" value={t1} onChange={(e) => handleSearch(e.target.value, 't1')} style={{ ...inputStyle, width: '180px', height: '48px', backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }} />
                  {showDropdown && activeInput === 't1' && <SuggestionsList suggestions={suggestions} onSelect={(s) => { setT1(s); setShowDropdown(false); }} theme={theme} />}
                </div>
                {mode === "compare" && (
                  <div style={{ position: 'relative' }}>
                    <input placeholder="Ticker 2" value={t2} onChange={(e) => handleSearch(e.target.value, 't2')} style={{ ...inputStyle, width: '180px', height: '48px', backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }} />
                    {showDropdown && activeInput === 't2' && <SuggestionsList suggestions={suggestions} onSelect={(s) => { setT2(s); setShowDropdown(false); }} theme={theme} />}
                  </div>
                )}
                <button onClick={() => handleAction()} style={{ ...mainBtn, height: '48px', padding: '0 25px', fontSize: '13px' }}>{loading ? "..." : "ANALYZE"}</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '35px', flexWrap: 'wrap' }}>
                {loading && <SkeletonCard theme={theme} />}
                {results.map((stock, i) => {
                  const statusColor = stock.risk === "High" ? "#f87171" : stock.risk === "Medium" ? "#fbbf24" : "#34d399";
                  return (
                    <div key={i} style={{ ...cardStyle, backgroundColor: theme.card, backdropFilter: theme.glass, border: `1px solid ${theme.border}`, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <div style={{ ...badgeStyle, backgroundColor: `${statusColor}22`, color: statusColor }}>{stock.recommendation}</div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button onClick={() => handleSetHolding(stock)} style={tradeBtn}>Sync Holding</button>
                          <button onClick={() => setWatchlist(prev => prev.includes(stock.symbol) ? prev.filter(s => s !== stock.symbol) : [...prev, stock.symbol])} 
                                  style={{background:'none', border:'none', fontSize:'24px', color: watchlist.includes(stock.symbol) ? theme.accent : theme.subText, cursor:'pointer'}}>
                            {watchlist.includes(stock.symbol) ? "★" : "☆"}
                          </button>
                        </div>
                      </div>
                      <h2 style={{margin:0, fontSize: '32px', fontWeight: '900', letterSpacing: '-1px'}}>{stock.symbol}</h2>
                      <div style={{ ...aiBox, backgroundColor: isDarkMode ? '#1c2128' : '#f8fafc', border: `1px solid ${theme.border}` }}>
                          <p style={{ margin: 0, fontSize: '13px', color: theme.text, lineHeight: '1.6' }}>{stock.ai_summary}</p>
                      </div>
                      <h1 style={{ color: theme.text, margin: '25px 0 10px 0', fontSize: '56px', fontWeight: '900', letterSpacing: '-2px' }}>₹{stock.price}</h1>

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
                            <Line name="Nifty 50" type="monotone" dataKey="nifty" stroke="#94a3b8" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      <div style={gridContainer}>
                        <div style={{ ...gridBox, backgroundColor: theme.inputBg }}><span style={gridTitle}>GROWTH</span><br/><span style={{fontWeight:'bold', color: stock.return > 0 ? '#34d399' : '#f87171'}}>{stock.return}%</span></div>
                        <div style={{ ...gridBox, backgroundColor: theme.inputBg }}><span style={gridTitle}>P/E</span><br/><span style={{fontWeight:'bold'}}>{stock.pe_ratio}</span></div>
                        <div title="Beta measures sensitivity to market movements. >1.0 means more volatile than Nifty 50." style={{ ...gridBox, backgroundColor: theme.inputBg, cursor: 'help' }}><span style={gridTitle}>BETA</span><br/><span style={{fontWeight:'bold'}}>1.21</span></div>
                        <div title="Sharpe Ratio measures risk-adjusted return. >1.0 is considered good, >2.0 is very good." style={{ ...gridBox, backgroundColor: theme.inputBg, cursor: 'help' }}><span style={gridTitle}>SHARPE</span><br/><span style={{fontWeight:'bold'}}>{stock.sharpe}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', textAlign: 'left' }}>
              {!user ? (
                <div style={{ ...cardStyle, width: '100%', padding: '80px', textAlign: 'center', backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '50px', marginBottom: '20px' }}>🔒</div>
                  <h2 style={{ color: theme.text, fontSize: '28px', fontWeight: '800' }}>Intelligence Locked</h2>
                  <p style={{ color: theme.subText, maxWidth: '400px', margin: '0 auto 30px auto' }}>Login to sync your holdings, predict market sensitivity, and calculate diversification scores.</p>
                  <button style={{ ...mainBtn, width: '240px' }} onClick={() => setShowLogin(true)}>Join Terminal</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '25px', marginBottom: '40px' }}>
                    <div title="Beta measures sensitivity to market movements. >1.0 means more volatile than Nifty 50." style={{ ...riskCardStyle, borderTop: `4px solid ${riskData?.portfolio_beta > 1 ? '#f87171' : theme.accent}`, backgroundColor: theme.card, cursor: 'help' }}>
                      <span style={gridTitle}>PORTFOLIO BETA</span>
                      <h2 style={{ margin: '10px 0', fontSize: '32px', color: riskData?.portfolio_beta > 1 ? '#f87171' : theme.accent }}>{riskData?.portfolio_beta || '0.00'}</h2>
                      <p style={{ fontSize: '11px', color: theme.subText }}>Market Shock Sensitivity</p>
                    </div>
                    
                    <div title="Sector exposure helps you predict sector-specific headwinds by seeing where your money is concentrated." style={{ ...riskCardStyle, backgroundColor: theme.card, flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
                      <div style={{ textAlign: 'left' }}>
                        <span style={gridTitle}>SECTOR EXPOSURE</span>
                        <h2 style={{ margin: '5px 0', fontSize: '18px' }}>Concentration</h2>
                      </div>
                      <div style={{ width: 120, height: 120 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={sectorData} innerRadius={35} outerRadius={50} paddingAngle={5} dataKey="value">
                              {sectorData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div title="This score predicts portfolio stability based on how your stocks move relative to each other." style={{ ...riskCardStyle, borderTop: `4px solid #34d399`, backgroundColor: theme.card, cursor: 'help' }}>
                      <span style={gridTitle}>DIVERSIFICATION</span>
                      <h2 style={{ margin: '10px 0', fontSize: '32px', color: '#34d399' }}>{riskData?.diversification_score || '0'}%</h2>
                      <p style={{ fontSize: '11px', color: theme.subText }}>Stability Score</p>
                    </div>
                  </div>

                  <div style={{ ...cardStyle, backgroundColor: theme.card, width: '100%', border: `1px solid ${theme.border}`, padding: '0' }}>
                    <div style={{ padding: '25px', borderBottom: `1px solid ${theme.border}` }}>
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>Active Holdings Analytics</h2>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'rgba(100,116,139,0.05)', color: theme.subText, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          <th style={{ padding: '20px' }}>Asset</th>
                          <th>Quantity</th>
                          <th>Avg Buy</th>
                          <th>Curr Gain</th>
                          <th>Beta</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.map((item, idx) => {
                          const livePrice = results.find(r => r.symbol === item.symbol)?.price || item.avgPrice;
                          const pnl = (livePrice - item.avgPrice) * item.qty;
                          return (
                            <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}`, fontSize: '14px', transition: '0.2s' }}>
                              <td style={{ padding: '20px', fontWeight: '800' }}>{item.symbol}</td>
                              <td>{item.qty}</td>
                              <td>₹{item.avgPrice.toFixed(2)}</td>
                              <td style={{ color: pnl >= 0 ? '#34d399' : '#f87171', fontWeight: 'bold' }}>
                                ₹{pnl.toFixed(2)}
                              </td>
                              <td style={{ cursor: 'help' }} title="Market sensitivity specific to this ticker.">{riskData?.individual_betas[item.symbol] || '--'}</td>
                              <td>
                                <button onClick={() => handleRemoveHolding(item.symbol)} style={deleteBtnStyle}>✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const SuggestionsList = ({ suggestions, onSelect, theme }) => (
  <ul style={{ ...dropdownStyle, backgroundColor: theme.card, border: `1px solid ${theme.border}`, backdropFilter: 'blur(10px)' }}>
    {suggestions.map((s, idx) => (
      <li key={idx} onClick={() => onSelect(s.symbol)} style={{ ...suggestionItem, color: theme.text, borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{s.symbol}</div>
        <div style={{ fontSize: '11px', color: theme.subText }}>{s.name}</div>
      </li>
    ))}
  </ul>
);

// POLISHED STYLES
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(8px)' };
const loginCardStyle = { padding: '50px', borderRadius: '32px', width: '420px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', position: 'relative' };
const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '800', color: '#8b949e', textTransform: 'uppercase', marginBottom: '5px', marginLeft: '5px' };
const closeBtnStyle = { position: 'absolute', top: '25px', right: '25px', background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '20px' };
const logoutBtnStyle = { background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', border: 'none', padding: '8px 15px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginTop: '15px', width: '100%' };
const riskCardStyle = { flex: 1, padding: '25px', borderRadius: '24px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', textAlign: 'center' };
const deleteBtnStyle = { background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '16px', padding: '10px' };

const tradeBtn = { padding: '8px 18px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '12px', fontSize: '12px', fontWeight: '800', cursor: 'pointer', transition: '0.2s' };
const containerStyle = { padding: '60px 40px 60px 280px', fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: '100vh', transition: '0.3s' };
const watchlistSidebar = { position: 'fixed', left: 0, top: 0, bottom: 0, width: '240px', padding: '40px 25px', textAlign: 'left', zIndex: 100 };
const watchlistItemWrapper = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' };
const watchlistItem = { padding: '14px', borderRadius: '14px', cursor: 'pointer', fontWeight: '800', fontSize: '13px', flex: 1, transition: '0.2s' };
const removeBtn = { background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 'bold' };
const inputStyle = { padding: '10px 20px', borderRadius: '15px', outline: 'none', border: '2px solid transparent', transition: '0.3s', fontSize: '14px', fontWeight: '600' };
const mainBtn = { padding: '15px 35px', backgroundColor: '#38bdf8', color: 'white', border: 'none', borderRadius: '18px', fontWeight: '800', cursor: 'pointer', transition: '0.2s', letterSpacing: '0.5px' };
const modeTabContainer = { display: 'inline-flex', padding: '6px', borderRadius: '18px' };
const activeTabStyle = { padding: '12px 24px', backgroundColor: '#ffffff', color: '#1a1d23', border: 'none', borderRadius: '14px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' };
const inactiveTabStyle = { padding: '12px 24px', backgroundColor: 'transparent', border: 'none', borderRadius: '14px', fontWeight: '700', cursor: 'pointer' };
const cardStyle = { padding: '35px', borderRadius: '35px', width: '460px', textAlign: 'left', transition: '0.3s' };
const aiBox = { padding: '20px', borderRadius: '22px', marginTop: '15px', backgroundColor: 'rgba(100,116,139,0.05)' };
const gridContainer = { display: 'flex', gap: '15px', marginTop: '25px' };
const gridBox = { flex: 1, padding: '18px', borderRadius: '20px', textAlign: 'center' };
const gridTitle = { fontSize: '9px', color: '#8b949e', display: 'block', marginBottom: '6px', fontWeight: '900', letterSpacing: '1px' };
const badgeStyle = { padding: '8px 16px', borderRadius: '12px', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase' };
const themeToggleStyle = { width: '100%', padding: '14px', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '800', background: 'linear-gradient(135deg, #1a1d23 0%, #38bdf8 100%)', color: 'white', fontSize: '12px' };
const pdfBtnStyle = { width: '100%', padding: '14px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '14px', fontWeight: '800', cursor: 'pointer', fontSize: '12px' };
const dropdownStyle = { position: 'absolute', top: '55px', width: '100%', zIndex: 1000, listStyle: 'none', padding: '10px', borderRadius: '20px' };
const suggestionItem = { padding: '14px', cursor: 'pointer', borderRadius: '12px', transition: '0.2s' };
const loginSideBtn = { ...mainBtn, padding: '12px', fontSize: '12px', width: '100%', marginBottom: '25px', backgroundColor: '#38bdf8' };
const balanceCard = { marginBottom: '30px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '18px', border: '1px solid #e1e4e8' };

export default App;