import React, { useEffect, useMemo, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Ellipsis,
  FileText,
  Filter,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Wallet,
  WalletCards,
  X,
  Sun,
  Moon,
  Trash2,
  Edit2,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, download, qs } from "./api.js";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const compactMoney = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0);
const dateKey = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  // Older or malformed records can have a missing/invalid date. Intl throws
  // RangeError for those values, which otherwise takes down the whole calendar.
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};
const inputDateTime = (d) => {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(d))
    .reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const indiaIso = (v) => `${v.length === 16 ? `${v}:00` : v}+05:30`;
const niceDate = (d) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(d));
const duration = (m) =>
  `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h ` : ""}${m % 60 ? `${m % 60}m` : m < 60 ? `${m}m` : ""}`.trim();
const today = dateKey(new Date());
const OWNER_DISPLAY_NAME = "Rohit Varma Kunaparaju";
async function saveExport(path, filename, onError = () => {}) {
  try {
    const blob = await download(path);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    onError(error.message);
  }
}
const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/expenses", "Expenses", WalletCards],
  ["/learning", "Learning", BookOpen],
  ["/calendar", "Calendar", CalendarDays],
  ["/reports", "Reports", ChartNoAxesCombined],
  ["/settings", "Settings", SettingsIcon],
];
const categories = [
  "Food",
  "Snacks and beverages",
  "Travel",
  "Shopping",
  "Hostel essentials",
  "Education",
  "Entertainment",
  "Health and personal care",
  "Bills and subscriptions",
  "Miscellaneous",
];
const subjects = [
  "DSA",
  "Java",
  "MERN Stack",
  "Backend Development",
  "AI and Machine Learning",
  "Japanese",
  "Finance and Investing",
  "Other",
];
const palette = [
  "#5176e8",
  "#8b6de0",
  "#f2a25a",
  "#43a78d",
  "#e47779",
  "#63a9ce",
  "#c280b5",
  "#d7bd53",
];

function App() {
  const [user, setUser] = useState(null),
    [boot, setBoot] = useState(true),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [settings, setSettings] = useState(null),
    [theme, setTheme] = useState(() => {
      const saved = localStorage.getItem("lifeledger-theme");
      const initial = saved === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = initial;
      return initial;
    });
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    api("/auth/me")
      .then(({ user }) => {
        setUser(user);
        setSettings(user.settings);
        setTheme(user.settings?.theme || theme);
      })
      .catch(() => {})
      .finally(() => setBoot(false));
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 3000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lifeledger-theme", theme);
  }, [theme]);
  useEffect(() => { if (settings?.theme) setTheme(settings.theme); }, [settings?.theme]);
  const toggleTheme = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setSettings(current => current ? { ...current, theme: next } : current);
    if (user) {
      try { await api("/settings", { method: "PATCH", body: JSON.stringify({ theme: next }) }); }
      catch (e) { setToast(`Theme saved on this device only: ${e.message}`); }
    }
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    navigate("/");
  };
  if (boot)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          <Wallet size={20} />
        </div>
        <span>Getting your ledger ready…</span>
      </div>
    );
  if (!user)
    return (
      <Login
        theme={theme}
        onThemeToggle={toggleTheme}
        onLogin={(u) => {
          setUser(u);
          setSettings(u.settings);
          setTheme(u.settings?.theme || theme);
          setToast(u.role === "owner" ? "Welcome back." : "Your account is ready.");
        }}
      />
    );
  const visibleNav = user.role === "owner" ? [...nav, ["/users", "Viewers", Users]] : nav;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "show" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Wallet size={19} />
          </div>
          <span>LifeLedger</span>
          <button
            className="icon-btn sidebar-close"
            onClick={() => setMobile(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace">
          <div className="avatar">
            {user.username.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>My workspace</strong>
            <small>{user.username}</small>
          </div>
          <ChevronDown size={15} className="muted" />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav">
          {visibleNav.map(([to, label, Icon]) => (
            <NavLink
              onClick={() => setMobile(false)}
              key={to}
              end={to === "/"}
              to={to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
              {to === "/expenses" && <span className="nav-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <div className="tip-icon">
              <Sparkles size={16} />
            </div>
            <strong>Small steps add up.</strong>
            <p>Every entry brings you closer to your goals.</p>
          </div>
          <button className="nav-link signout" onClick={logout}>
            <LogOut size={17} />
            Sign out
          </button>
          <div className="sidebar-foot">
            <span>LifeLedger · v1.0</span>
            <CircleHelp size={15} />
          </div>
        </div>
      </aside>
      <div className="mobile-overlay" onClick={() => setMobile(false)}></div>
      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobile(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            My workspace <ChevronRight size={14} />{" "}
            <strong>
              {visibleNav.find((x) => x[0] === location.pathname)?.[1] || "Overview"}
            </strong>
          </div>
          <div className="top-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme}/>
            <span className="today-label">
              {new Intl.DateTimeFormat("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "Asia/Kolkata",
              }).format(new Date())}
            </span>
            <span className="top-divider" />
            <div className="top-avatar">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <div className="page-wrap">
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  settings={settings}
                  onNavigate={navigate}
                  onToast={setToast}
                />
              }
            />
            <Route
              path="/expenses"
              element={<Expenses onToast={setToast} settings={settings} />}
            />
            <Route
              path="/learning"
              element={<Learning onToast={setToast} settings={settings} />}
            />
            <Route path="/calendar" element={<Calendar onToast={setToast} />} />
            <Route path="/reports" element={<Reports />} />
            <Route
              path="/settings"
              element={
                <Settings
                  settings={settings}
                  onSettings={setSettings}
                  onToast={setToast}
                />
              }
            />
            <Route path="/users" element={user.role === "owner" ? <Viewers onToast={setToast} /> : <Navigate replace to="/" />} />
            <Route
              path="*"
              element={
                <Dashboard
                  settings={settings}
                  onNavigate={navigate}
                  onToast={setToast}
                />
              }
            />
          </Routes>
        </div>
      </main>
      {toast && (
        <div className="toast">
          <span className="toast-check">
            <Check size={14} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const next = theme === "dark" ? "light" : "dark";
  return <button type="button" className="theme-toggle" aria-label={`Switch to ${next} mode`} title={`${theme === "dark" ? "Dark" : "Light"} mode · switch to ${next}`} onClick={onToggle}>{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}<span>{theme === "dark" ? "Dark" : "Light"}</span></button>;
}

function Login({ onLogin, theme, onThemeToggle }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [registering, setRegistering] = useState(false),
    [pendingApproval, setPendingApproval] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api(registering ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (registering) setPendingApproval(r.username || username.trim());
      else onLogin(r.user);
    } catch (e) {
      if (e.code === "PENDING_APPROVAL") setPendingApproval(username.trim());
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (pendingApproval) return <PendingApproval theme={theme} onThemeToggle={onThemeToggle} username={pendingApproval} onBack={() => { setPendingApproval(""); setRegistering(false); setPassword(""); setError(""); }} />;
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand login-brand">
          <div className="brand-mark">
            <Wallet size={20} />
          </div>
          <span>LifeLedger</span>
          <ThemeToggle theme={theme} onToggle={onThemeToggle}/>
        </div>
        <div className="eyebrow">{registering ? "CREATE YOUR ACCOUNT" : "YOUR PERSONAL SPACE"}</div>
        <div className="owner-notice">Personal application owned by <strong>{OWNER_DISPLAY_NAME}</strong>. New accounts require administrator approval before they can access the application.</div>
        <h1>
          A little more clarity,
          <br />
          <span>every day.</span>
        </h1>
        <p className="login-sub">
          {registering ? "Create a private space for your money and learning." : "Sign in to see how your money and learning are growing."}
        </p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={registering ? 3 : undefined}
              maxLength={registering ? 30 : 100}
              placeholder="Your username"
            />
          </label>
          <label>
            Password
            <input
              autoComplete={registering ? "new-password" : "current-password"}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={registering ? 10 : undefined}
              maxLength={72}
              placeholder="Your password"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button disabled={busy} className="btn primary full">
            {busy ? (registering ? "Creating account…" : "Signing in…") : (registering ? "Create account" : "Sign in")}
            <ChevronRight size={17} />
          </button>
        </form>
        <button className="auth-switch" type="button" onClick={() => { setRegistering(value => !value); setError(""); }}>
          {registering ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        {registering && <div className="field-help">Username: 3–30 letters, numbers, dots, dashes, or underscores. Password: at least 10 characters.</div>}
        <div className="login-note">
          <span className="secure-dot" /> Private to your account
        </div>
      </div>
      <div className="login-art">
        <div className="art-orb orb-one" />
        <div className="art-orb orb-two" />
        <div className="art-card">
          <div className="art-card-head">
            <span>YOUR MONTH</span>
            <span className="art-green">↗ 12.4%</span>
          </div>
          <strong>₹ 18,420</strong>
          <div className="art-spark">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="art-card-foot">
            <span>Spending this month</span>
            <span>Learning · 24h 30m</span>
          </div>
        </div>
        <div className="art-quote">“Progress is built one day at a time.”</div>
        <div className="art-dots">•••</div>
      </div>
    </div>
  );
}

function PendingApproval({ username, onBack, theme, onThemeToggle }) {
  return <div className="login-page approval-page"><section className="pending-card" aria-labelledby="pending-title">
    <div className="brand login-brand"><div className="brand-mark"><Wallet size={20}/></div><span>LifeLedger</span><ThemeToggle theme={theme} onToggle={onThemeToggle}/></div>
    <div className="pending-icon"><Clock3 size={23}/></div>
    <div className="eyebrow">ACCOUNT CREATED</div>
    <h1 id="pending-title">You’re on the list, {username}.</h1>
    <p>Your account has been created successfully and is waiting for approval from <strong>{OWNER_DISPLAY_NAME}</strong>. You will be able to access LifeLedger after the administrator approves your account.</p>
    <div className="owner-notice">Personal application owned by <strong>{OWNER_DISPLAY_NAME}</strong>. New accounts require administrator approval before they can access the application.</div>
    <button className="btn primary full" onClick={onBack}>Return to sign in <ChevronRight size={17}/></button>
  </section></div>;
}

function PageTitle({ eyebrow, title, description, action }) {
  return (
    <div className="page-title-row">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}
function Card({ children, className = "" }) {
  return <section className={`card ${className}`}>{children}</section>;
}
function Stat({ label, value, sub, icon: Icon, color = "blue", trend }) {
  return (
    <Card className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-bottom">
        {trend && (
          <span className="trend">
            <ArrowUpRight size={13} />
            {trend}
          </span>
        )}
        <span>{sub}</span>
      </div>
    </Card>
  );
}
function SectionHead({ title, sub, action }) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}
function Empty({ icon: Icon = Activity, title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={21} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Dashboard({ settings, onNavigate, onToast }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [modal, setModal] = useState("");
  const [review, setReview] = useState("");
  async function refresh() {
    try {
      setData(await api("/dashboard/summary"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
    api(`/daily-reviews/${today}`)
      .then((r) => setReview(r.item.reflection || ""))
      .catch(() => {});
  }, []);
  async function saveReview() {
    try {
      await api(`/daily-reviews/${today}`, {
        method: "PUT",
        body: JSON.stringify({ reflection: review }),
      });
      onToast("Daily reflection saved.");
    } catch (e) {
      onToast(e.message);
    }
  }
  const daily = data?.trend || [];
  const total = data?.month?.spent || 0;
  const budget = data?.budget?.amount || 0;
  const pct = budget ? Math.min((total / budget) * 100, 100) : 0;
  return (
    <>
      <PageTitle
        eyebrow={new Intl.DateTimeFormat("en-IN", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "Asia/Kolkata",
        })
          .format(new Date())
          .toUpperCase()}
        title="Good morning"
        description="A clear look at your money, your learning, and everything in between."
        action={
          <button className="btn primary" onClick={() => setModal("expense")}>
            <Plus size={17} /> Quick add
          </button>
        }
      />
      {error && (
        <div className="inline-error">
          {error} <button onClick={refresh}>Try again</button>
        </div>
      )}
      <div className="stat-grid">
        <Stat
          label="Spent this month"
          value={data ? money(data.month.spent) : "—"}
          sub={
            data
              ? `${money(data.today.spent)} spent today`
              : "Summary unavailable"
          }
          icon={WalletCards}
          color="blue"
        />
        <Stat
          label="Learning this month"
          value={data ? duration(data.month.learningMinutes) : "—"}
          sub={
            data
              ? `${duration(data.today.learningMinutes)} learned today`
              : "Summary unavailable"
          }
          icon={BookOpen}
          color="purple"
        />
        <Stat
          label="Budget remaining"
          value={
            data ? (budget ? money(data.budget.remaining) : "Not set") : "—"
          }
          sub={
            data && budget && data.month.spent > budget
              ? `${money(data.month.spent - budget)} over budget`
              : budget
                ? "Monthly budget"
                : "Set a monthly budget"
          }
          icon={Activity}
          color={
            data && budget && data.month.spent > budget ? "orange" : "green"
          }
        />
        <Stat
          label="Active learning days"
          value={data ? `${data.month.activeDays} days` : "—"}
          sub={
            data
              ? `${data.month.sessions} sessions this month`
              : "Summary unavailable"
          }
          icon={Sparkles}
          color="orange"
        />
      </div>
      <div className="dashboard-grid">
        <Card className="spending-card">
          <SectionHead
            title="Spending overview"
            sub="Your daily spending this month"
            action={
              <button
                className="text-btn"
                onClick={() => onNavigate("/reports")}
              >
                View report <ChevronRight size={15} />
              </button>
            }
          />
          <div className="chart-summary">
            <div>
              <span className="summary-label">Total spent</span>
              <strong>{data ? money(total) : "—"}</strong>
            </div>
            {budget > 0 && (
              <div className="budget-mini">
                <span>{Math.round(pct)}% of budget</span>
                <div className="progress-track">
                  <i
                    style={{
                      width: `${pct}%`,
                      background:
                        pct >= 100
                          ? "#dc686a"
                          : pct >= 80
                            ? "#e6a442"
                            : "#6481e7",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          {daily.length ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="215">
                <AreaChart
                  data={daily}
                  margin={{ left: -15, right: 4, top: 12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#6683e9"
                        stopOpacity={0.17}
                      />
                      <stop offset="95%" stopColor="#6683e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--line)"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(x) => new Date(`${x}T12:00:00`).getDate()}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                  />
                  <YAxis
                    tickFormatter={compactMoney}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                  />
                  <Tooltip
                    formatter={(v) => money(v)}
                    labelFormatter={(x) => niceDate(`${x}T12:00:00`)}
                    contentStyle={{
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      background: "var(--card)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#6683e9"
                    strokeWidth={2.5}
                    fill="url(#spendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              icon={WalletCards}
              title="No spending just yet"
              description="Your monthly spending trend will appear here."
              action={
                <button
                  className="text-btn"
                  onClick={() => setModal("expense")}
                >
                  Add your first expense <ChevronRight size={15} />
                </button>
              }
            />
          )}
        </Card>
        <Card className="category-card">
          <SectionHead
            title="Where it goes"
            sub="Spending by category"
            action={
              <button className="icon-btn small">
                <Ellipsis size={18} />
              </button>
            }
          />
          {data?.categories?.length ? (
            <>
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height={185}>
                  <PieChart>
                    <Pie
                      data={data.categories}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={56}
                      outerRadius={76}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {data.categories.map((x, i) => (
                        <Cell key={x.name} fill={palette[i % palette.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => money(v)}
                      contentStyle={{
                        border: "1px solid var(--line)",
                        borderRadius: 12,
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong>{money(total)}</strong>
                  <span>this month</span>
                </div>
              </div>
              <div className="legend-list">
                {data.categories.slice(0, 4).map((x, i) => (
                  <div className="legend-item" key={x.name}>
                    <i style={{ background: palette[i % palette.length] }} />
                    <span>{x.name}</span>
                    <strong>{money(x.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty
              icon={ChartNoAxesCombined}
              title="Your categories will show here"
              description="Log an expense to see where your money goes."
            />
          )}
        </Card>
      </div>
      <div className="dashboard-grid lower-grid">
        <Card>
          <SectionHead
            title="Recent expenses"
            sub="Your latest transactions"
            action={
              <button
                className="text-btn"
                onClick={() => onNavigate("/expenses")}
              >
                All expenses <ChevronRight size={15} />
              </button>
            }
          />
          {data?.recent?.length ? (
            <div className="recent-list">
              {data.recent.map((x) => (
                <div className="recent-row" key={x._id}>
                  <div className="recent-icon">
                    <WalletCards size={16} />
                  </div>
                  <div className="recent-main">
                    <strong>{x.description}</strong>
                    <span>
                      {x.category} · {niceDate(x.transactionDate)}
                    </span>
                  </div>
                  <strong className="recent-amount">−{money(x.amount)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={WalletCards}
              title="No expenses yet"
              description="Add your first expense to start seeing patterns."
              action={
                <button
                  className="btn secondary small-btn"
                  onClick={() => setModal("expense")}
                >
                  <Plus size={15} /> Add expense
                </button>
              }
            />
          )}
        </Card>
        <Card>
          <SectionHead
            title="Learning focus"
            sub="Time spent by subject"
            action={
              <button
                className="text-btn"
                onClick={() => onNavigate("/learning")}
              >
                Learning log <ChevronRight size={15} />
              </button>
            }
          />
          {data?.subjects?.length ? (
            <div className="subject-bars">
              {data.subjects.slice(0, 5).map((x, i) => (
                <div className="subject-bar-row" key={x.name}>
                  <div className="subject-bar-label">
                    <span>{x.name}</span>
                    <strong>{duration(x.value)}</strong>
                  </div>
                  <div className="bar-track">
                    <i
                      style={{
                        width: `${Math.max(7, (x.value / data.subjects[0].value) * 100)}%`,
                        background: palette[(i + 1) % palette.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={BookOpen}
              title="Make room to learn"
              description="Your study sessions will add up here."
              action={
                <button
                  className="text-btn"
                  onClick={() => setModal("learning")}
                >
                  Log a session <ChevronRight size={15} />
                </button>
              }
            />
          )}
        </Card>
      </div>
      <div className="dashboard-grid bottom-grid">
        <Card className="goal-card">
          <div className="goal-art">
            <div className="goal-orbit orbit-a" />
            <div className="goal-orbit orbit-b" />
            <span>
              <BookOpen size={22} />
            </span>
          </div>
          <div className="goal-content">
            <div className="eyebrow">YOUR WEEKLY GOAL</div>
            <h3>Keep the momentum going.</h3>
            <p>
              You’ve learned for{" "}
              <strong>{duration(data?.week?.learningMinutes || 0)}</strong> this
              week. Every session counts.
            </p>
            <div className="goal-progress">
              <div className="progress-track">
                <i
                  style={{
                    width: `${Math.min(100, ((data?.week?.learningMinutes || 0) / (settings?.weeklyGoalMinutes || 420)) * 100)}%`,
                  }}
                />
              </div>
              <span>
                {Math.min(
                  100,
                  Math.round(
                    ((data?.week?.learningMinutes || 0) /
                      (settings?.weeklyGoalMinutes || 420)) *
                      100,
                  ),
                )}
                %
              </span>
            </div>
          </div>
          <button
            className="btn secondary"
            onClick={() => setModal("learning")}
          >
            <Plus size={16} /> Log learning
          </button>
        </Card>
        <Card className="review-card">
          <SectionHead
            title="Today’s reflection"
            sub="A small pause to notice your progress"
          />
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            maxLength={2000}
            placeholder="What’s one thing you’re proud of today?"
          />
          <div className="review-footer">
            <span>{review.length}/2000</span>
            <button onClick={saveReview} className="btn secondary small-btn">
              <Check size={15} /> Save reflection
            </button>
          </div>
        </Card>
      </div>
      {modal && (
        <RecordModal
          type={modal}
          settings={settings}
          onClose={() => setModal("")}
          onToast={onToast}
          onSaved={refresh}
        />
      )}
    </>
  );
}

function RecordModal({
  type,
  onClose,
  onToast,
  onSaved,
  initial = null,
  settings,
}) {
  const isExpense = type === "expense",
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const categoryOptions = settings?.categories?.length
      ? settings.categories
      : categories,
    subjectOptions = settings?.subjects?.length ? settings.subjects : subjects;
  const [form, setForm] = useState(
    initial || {
      amount: "",
      category: categoryOptions[0],
      description: "",
      transactionDate: `${today}T12:00`,
      paymentMethod: "UPI",
      notes: "",
      subject: subjectOptions[0],
      topic: "",
      durationMinutes: "",
      sessionDate: `${today}T12:00`,
      whatILearned: "",
      problemsSolved: "",
      tasksCompleted: "",
      difficulty: "",
    },
  );
  function change(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = isExpense
      ? {
          amount: Number(form.amount),
          category: form.category,
          description: form.description,
          transactionDate: indiaIso(form.transactionDate),
          paymentMethod: form.paymentMethod,
          notes: form.notes,
        }
      : {
          subject: form.subject,
          topic: form.topic,
          durationMinutes: Number(form.durationMinutes),
          sessionDate: indiaIso(form.sessionDate),
          whatILearned: form.whatILearned,
          problemsSolved: Number(form.problemsSolved || 0),
          tasksCompleted: Number(form.tasksCompleted || 0),
          difficulty: form.difficulty,
          notes: form.notes,
        };
    try {
      await api(
        `${isExpense ? "/expenses" : "/learning"}${initial ? `/${initial._id}` : ""}`,
        { method: initial ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      onToast(isExpense ? "Expense saved." : "Learning session saved.");
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">QUICK ENTRY</div>
            <h2 id="modal-title">
              {isExpense ? "Add an expense" : "Log learning"}
            </h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-fields">
            {isExpense ? (
              <>
                <label>
                  Amount{" "}
                  <span className="input-prefix">
                    <b>₹</b>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => change("amount", e.target.value)}
                    />
                  </span>
                </label>
                <label>
                  Category
                  <select
                    value={form.category}
                    onChange={(e) => change("category", e.target.value)}
                  >
                    {categoryOptions.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="wide-field">
                  Description
                  <input
                    required
                    maxLength="140"
                    placeholder="What did you spend on?"
                    value={form.description}
                    onChange={(e) => change("description", e.target.value)}
                  />
                </label>
                <label>
                  Date & time
                  <input
                    type="datetime-local"
                    required
                    value={form.transactionDate}
                    onChange={(e) => change("transactionDate", e.target.value)}
                  />
                </label>
                <label>
                  Payment method
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => change("paymentMethod", e.target.value)}
                  >
                    {["UPI", "Cash", "Card", "Bank transfer", "Other"].map(
                      (x) => (
                        <option key={x}>{x}</option>
                      ),
                    )}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  Subject
                  <select
                    value={form.subject}
                    onChange={(e) => change("subject", e.target.value)}
                  >
                    {subjectOptions.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Topic
                  <input
                    required
                    maxLength="140"
                    placeholder="What are you studying?"
                    value={form.topic}
                    onChange={(e) => change("topic", e.target.value)}
                  />
                </label>
                <label>
                  Duration{" "}
                  <span className="input-suffix">
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      step="1"
                      required
                      placeholder="30"
                      value={form.durationMinutes}
                      onChange={(e) =>
                        change("durationMinutes", e.target.value)
                      }
                    />
                    <b>min</b>
                  </span>
                </label>
                <label>
                  Date & time
                  <input
                    type="datetime-local"
                    required
                    value={form.sessionDate}
                    onChange={(e) => change("sessionDate", e.target.value)}
                  />
                </label>
                <label>
                  Difficulty
                  <select
                    value={form.difficulty}
                    onChange={(e) => change("difficulty", e.target.value)}
                  >
                    <option value="">Not specified</option>
                    {["Easy", "Medium", "Hard"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Problems solved
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={form.problemsSolved}
                    onChange={(e) => change("problemsSolved", e.target.value)}
                  />
                </label>
                <label className="wide-field">
                  What I learned
                  <textarea
                    rows="2"
                    value={form.whatILearned}
                    onChange={(e) => change("whatILearned", e.target.value)}
                    placeholder="Capture a useful takeaway…"
                  />
                </label>
              </>
            )}
            <label className="wide-field">
              Notes <span className="optional">Optional</span>
              <textarea
                rows="2"
                value={form.notes}
                onChange={(e) => change("notes", e.target.value)}
                placeholder="Anything else to remember?"
              />
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button disabled={busy} className="btn primary">
              <Check size={16} />
              {busy ? "Saving…" : isExpense ? "Save expense" : "Save session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RecordList({ type, items, onEdit, onDelete }) {
  const exp = type === "expense";
  if (!items.length)
    return (
      <Empty
        icon={exp ? WalletCards : BookOpen}
        title={exp ? "No expenses found" : "No learning sessions found"}
        description={
          exp
            ? "Try changing your filters or add your first expense."
            : "Try changing your filters or log a session."
        }
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {(exp
              ? ["Description", "Category", "Date", "Payment", "Amount", ""]
              : ["Topic", "Subject", "Date", "Duration", "Takeaway", ""]
            ).map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x._id}>
              <td>
                <div className="table-primary">
                  {exp ? x.description : x.topic}
                </div>
                {exp && x.notes && (
                  <div className="table-secondary">{x.notes}</div>
                )}
              </td>
              <td>
                <span className="pill">{exp ? x.category : x.subject}</span>
              </td>
              <td>{niceDate(exp ? x.transactionDate : x.sessionDate)}</td>
              <td>{exp ? x.paymentMethod : duration(x.durationMinutes)}</td>
              <td className={exp ? "amount-cell" : ""}>
                {exp ? money(x.amount) : x.whatILearned || "—"}
              </td>
              <td>
                <div className="row-actions">
                  <button onClick={() => onEdit(x)} aria-label="Edit">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => onDelete(x)} aria-label="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RecordsPage({ type, onToast, settings }) {
  const exp = type === "expense",
    [items, setItems] = useState([]),
    [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 }),
    [filters, setFilters] = useState({
      search: "",
      from: "",
      to: "",
      category: "",
      subject: "",
      paymentMethod: "",
      minAmount: "",
      maxAmount: "",
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [modal, setModal] = useState(false),
    [editing, setEditing] = useState(null),
    [confirm, setConfirm] = useState(null);
  const endpoint = exp ? "expenses" : "learning";
  async function load(page = 1) {
    setLoading(true);
    setError("");
    try {
      const f = { ...filters, page, limit: 20 };
      if (exp) {
        delete f.subject;
      } else {
        delete f.category;
        delete f.paymentMethod;
        delete f.minAmount;
        delete f.maxAmount;
      }
      const r = await api(`/${endpoint}${qs(f)}`);
      setItems(r.items);
      setPagination(r.pagination);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(1);
  }, [type, filters]);
  async function remove() {
    try {
      await api(`/${endpoint}/${confirm._id}`, { method: "DELETE" });
      onToast(exp ? "Expense deleted." : "Session deleted.");
      setConfirm(null);
      load(pagination.page);
    } catch (e) {
      onToast(e.message);
    }
  }
  function edit(x) {
    const date = exp ? x.transactionDate : x.sessionDate;
    setEditing({
      ...x,
      [exp ? "transactionDate" : "sessionDate"]: inputDateTime(date),
      amount: x.amount ?? x.amountPaise / 100,
    });
    setModal(true);
  }
  const clear = () =>
    setFilters({
      search: "",
      from: "",
      to: "",
      category: "",
      subject: "",
      paymentMethod: "",
      minAmount: "",
      maxAmount: "",
    });
  return (
    <>
      <PageTitle
        eyebrow={exp ? "MONEY, MADE CLEAR" : "LEARNING, MADE VISIBLE"}
        title={exp ? "Expenses" : "Learning log"}
        description={
          exp
            ? "Keep track of the little things and the bigger picture."
            : "A record of what you are learning, one session at a time."
        }
        action={
          <button
            className="btn primary"
            onClick={() => {
              setEditing(null);
              setModal(true);
            }}
          >
            <Plus size={17} />
            {exp ? "Add expense" : "Log a session"}
          </button>
        }
      />
      <Card className="records-card">
        <div className="filter-bar">
          <div className="search-field">
            <Search size={16} />
            <input
              placeholder={
                exp ? "Search expenses…" : "Search topics and notes…"
              }
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
            />
          </div>
          <div className="filter-item">
            <Filter size={15} />
            <span>Filters</span>
          </div>
          {exp ? (
            <>
              <select
                value={filters.category}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, category: e.target.value }))
                }
              >
                <option value="">All categories</option>
                {categories.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                value={filters.paymentMethod}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, paymentMethod: e.target.value }))
                }
              >
                <option value="">All payments</option>
                {["UPI", "Cash", "Card", "Bank transfer", "Other"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </>
          ) : (
            <select
              value={filters.subject}
              onChange={(e) =>
                setFilters((f) => ({ ...f, subject: e.target.value }))
              }
            >
              <option value="">All subjects</option>
              {subjects.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          )}
          <input
            type="date"
            aria-label="From date"
            value={filters.from}
            onChange={(e) =>
              setFilters((f) => ({ ...f, from: e.target.value }))
            }
          />
          <input
            type="date"
            aria-label="To date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>
        {exp && (
          <div className="amount-filter">
            <span>Amount range</span>
            <span className="range-input">
              <b>₹</b>
              <input
                type="number"
                min="0"
                placeholder="Min"
                value={filters.minAmount}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, minAmount: e.target.value }))
                }
              />
            </span>
            <span className="range-dash">—</span>
            <span className="range-input">
              <b>₹</b>
              <input
                type="number"
                min="0"
                placeholder="Max"
                value={filters.maxAmount}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, maxAmount: e.target.value }))
                }
              />
            </span>
            <button className="text-btn clear-btn" onClick={clear}>
              Clear filters
            </button>
            <button
              className="text-btn export-btn"
              onClick={() => saveExport(`/export/${endpoint}${qs(filters)}`, `${endpoint}.csv`, onToast)}
            >
              Export CSV <Download size={14} />
            </button>
          </div>
        )}
        {error ? (
          <div className="inline-error">
            {error}
            <button onClick={() => load()}>Try again</button>
          </div>
        ) : loading ? (
          <div className="table-loading">Loading your records…</div>
        ) : (
          <RecordList
            type={type}
            items={items}
            onEdit={edit}
            onDelete={setConfirm}
          />
        )}
        <div className="pagination">
          <span>
            {pagination.total
              ? `${(pagination.page - 1) * 20 + 1}–${Math.min(pagination.page * 20, pagination.total)} of ${pagination.total} records`
              : "0 records"}
          </span>
          <div>
            <button
              disabled={pagination.page <= 1}
              onClick={() => load(pagination.page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {pagination.page} of {Math.max(1, pagination.pages)}
            </span>
            <button
              disabled={pagination.page >= pagination.pages}
              onClick={() => load(pagination.page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </Card>
      {modal && (
        <RecordModal
          type={type}
          settings={settings}
          initial={editing}
          onClose={() => setModal(false)}
          onToast={onToast}
          onSaved={() => load(pagination.page)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          text={`Delete “${exp ? confirm.description : confirm.topic}”? This action cannot be undone.`}
          onClose={() => setConfirm(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
function Expenses(props) {
  return <RecordsPage type="expense" {...props} />;
}
function Learning(props) {
  return <RecordsPage type="learning" {...props} />;
}
function ConfirmDialog({ text, onClose, onConfirm, title = "Delete this record?", confirmLabel = "Delete", busy = false }) {
  return (
    <div className="modal-backdrop">
      <div className="confirm-dialog" role="dialog" aria-modal="true">
        <div className="confirm-icon">
          <Trash2 size={20} />
        </div>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="modal-actions">
          <button disabled={busy} className="btn ghost" onClick={onClose}>
            Keep record
          </button>
          <button disabled={busy} className="btn danger" onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Calendar({ onToast }) {
  const [month, setMonth] = useState(new Date(`${today}T12:00:00`)),
    [items, setItems] = useState([]),
    [selected, setSelected] = useState(today),
    [modal, setModal] = useState(""),
    [loading, setLoading] = useState(true);
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    offset = (first.getDay() + 6) % 7;
  useEffect(() => {
    setLoading(true);
    const from = dateKey(
        new Date(month.getFullYear(), month.getMonth(), 1, 12),
      ),
      to = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0, 12));
    Promise.all([
      api(`/expenses${qs({ from, to, limit: 100 })}`),
      api(`/learning${qs({ from, to, limit: 100 })}`),
    ])
      .then(([e, l]) =>
        setItems([
          ...e.items.map((x) => ({ ...x, kind: "expense" })),
          ...l.items.map((x) => ({ ...x, kind: "learning" })),
        ]),
      )
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [month]);
  const selectedItems = items.filter(
    (x) =>
      dateKey(x.kind === "expense" ? x.transactionDate : x.sessionDate) ===
      selected,
  );
  function shift(n) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR LIFE, DAY BY DAY"
        title="Calendar"
        description="See how your spending and learning fit into each day."
        action={
          <button className="btn primary" onClick={() => setModal("expense")}>
            <Plus size={16} /> Add to{" "}
            {new Date(`${selected}T12:00:00`).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </button>
        }
      />
      <div className="calendar-layout">
        <Card className="calendar-card">
          <div className="calendar-heading">
            <div>
              <h2>
                {month.toLocaleDateString("en-IN", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <span className="calendar-legend">
                <i className="legend-expense" /> Expenses{" "}
                <i className="legend-learning" /> Learning
              </span>
            </div>
            <div className="calendar-controls">
              <button
                onClick={() => {
                  setMonth(new Date());
                  setSelected(today);
                }}
                className="btn secondary small-btn"
              >
                Today
              </button>
              <button aria-label="Previous month" onClick={() => shift(-1)}>
                <ChevronLeft size={18} />
              </button>
              <button aria-label="Next month" onClick={() => shift(1)}>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="calendar-grid weekday-row">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <div className="calendar-grid date-grid">
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} className="date-blank" />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1,
                key = dateKey(
                  new Date(month.getFullYear(), month.getMonth(), day, 12),
                ),
                records = items.filter(
                  (x) =>
                    dateKey(
                      x.kind === "expense" ? x.transactionDate : x.sessionDate,
                    ) === key,
                ),
                hasE = records.some((x) => x.kind === "expense"),
                hasL = records.some((x) => x.kind === "learning");
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`calendar-day ${selected === key ? "selected" : ""} ${key === today ? "is-today" : ""}`}
                >
                  <span>{day}</span>
                  <i className="day-marks">
                    {hasE && <b className="expense-mark" />}
                    {hasL && <b className="learning-mark" />}
                  </i>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend mobile-legend">
            <i className="legend-expense" /> Expenses{" "}
            <i className="legend-learning" /> Learning
          </div>
        </Card>
        <Card className="day-detail">
          <div className="eyebrow">DAILY REVIEW</div>
          <h2>
            {new Date(`${selected}T12:00:00`).toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <div className="day-summary">
            <div>
              <span className="detail-icon expense-icon">
                <WalletCards size={16} />
              </span>
              <div>
                <small>Spent</small>
                <strong>
                  {money(
                    selectedItems
                      .filter((x) => x.kind === "expense")
                      .reduce((s, x) => s + x.amount, 0),
                  )}
                </strong>
              </div>
            </div>
            <div>
              <span className="detail-icon learning-icon">
                <BookOpen size={16} />
              </span>
              <div>
                <small>Learning</small>
                <strong>
                  {duration(
                    selectedItems
                      .filter((x) => x.kind === "learning")
                      .reduce((s, x) => s + x.durationMinutes, 0),
                  )}
                </strong>
              </div>
            </div>
          </div>
          <div className="day-records-head">
            {selectedItems.length
              ? `${selectedItems.length} entries`
              : "Your day"}
          </div>
          {loading ? (
            <p className="muted">Loading calendar…</p>
          ) : selectedItems.length ? (
            <div className="day-record-list">
              {selectedItems.map((x) => (
                <div className="day-record" key={x._id}>
                  <span className={`record-dot ${x.kind}`} />
                  <div>
                    <strong>
                      {x.kind === "expense" ? x.description : x.topic}
                    </strong>
                    <span>{x.kind === "expense" ? x.category : x.subject}</span>
                  </div>
                  <b>
                    {x.kind === "expense"
                      ? money(x.amount)
                      : duration(x.durationMinutes)}
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <p className="day-empty">
              Nothing logged on this day yet. A new day is a fresh page.
            </p>
          )}
          <div className="day-actions">
            <button
              className="btn secondary"
              onClick={() => setModal("expense")}
            >
              <Plus size={15} /> Expense
            </button>
            <button
              className="btn secondary"
              onClick={() => setModal("learning")}
            >
              <Plus size={15} /> Learning
            </button>
          </div>
        </Card>
      </div>
      {modal && (
        <RecordModal
          type={modal}
          onClose={() => setModal("")}
          onToast={onToast}
          onSaved={() => {
            const [y, m] = selected.split("-").map(Number);
            setMonth(new Date(y, m - 1, 1));
          }}
        />
      )}
    </>
  );
}

function Reports() {
  const [range, setRange] = useState("month"),
    [data, setData] = useState(null),
    [learn, setLearn] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const dates = useMemo(() => {
    const now = new Date(`${today}T12:00:00`),
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (range === "week") {
      const offset = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - offset);
    } else if (range === "year") start.setMonth(0);
    return { from: dateKey(start), to: today };
  }, [range]);
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api(`/reports/expenses${qs(dates)}`),
      api(`/reports/learning${qs(dates)}`),
    ])
      .then(([e, l]) => {
        setData(e);
        setLearn(l);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dates]);
  const expExport = () => saveExport(`/export/expenses${qs(dates)}`, "expenses.csv");
  return (
    <>
      <PageTitle
        eyebrow="THE BIGGER PICTURE"
        title="Reports"
        description="Thoughtful trends for your spending and learning."
        action={
          <button className="btn secondary" onClick={expExport}>
            <Download size={16} /> Export data
          </button>
        }
      />
      <div className="report-controls">
        <span>Showing</span>
        <div className="segmented">
          {[
            ["week", "This week"],
            ["month", "This month"],
            ["year", "This year"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={range === k ? "chosen" : ""}
              onClick={() => setRange(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="report-dates">
          {niceDate(`${dates.from}T12:00:00`)} —{" "}
          {niceDate(`${dates.to}T12:00:00`)}
        </span>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {loading ? (
        <div className="table-loading">Gathering your reports…</div>
      ) : (
        <>
          <div className="stat-grid report-stats">
            <Stat
              label="Total spent"
              value={money(data?.total)}
              sub={`${data?.count || 0} transactions`}
              icon={WalletCards}
              color="blue"
            />
            <Stat
              label="Daily average"
              value={money(data?.averageDaily)}
              sub="On days you spent"
              icon={Activity}
              color="purple"
            />
            <Stat
              label="Learning time"
              value={duration(learn?.totalMinutes || 0)}
              sub={`${learn?.sessions || 0} sessions`}
              icon={BookOpen}
              color="green"
            />
            <Stat
              label="Active learning days"
              value={`${learn?.activeDays || 0} days`}
              sub="Days with a session"
              icon={Sparkles}
              color="orange"
            />
          </div>
          <div className="dashboard-grid report-grid">
            <Card>
              <SectionHead
                title="Spending trend"
                sub="Daily spending over selected period"
              />
              {data?.trend?.length ? (
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart
                    data={data.trend}
                    margin={{ left: -15, right: 4, top: 12, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--line)"
                      strokeDasharray="3 5"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(x) => new Date(`${x}T12:00:00`).getDate()}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                    />
                    <YAxis
                      tickFormatter={compactMoney}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                    />
                    <Tooltip
                      formatter={(v) => money(v)}
                      contentStyle={{
                        border: "1px solid var(--line)",
                        borderRadius: 12,
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="value"
                      name="Spent"
                      fill="#6984e8"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty
                  title="No spending in this period"
                  description="Once you log expenses, the trend will appear here."
                />
              )}
            </Card>
            <Card>
              <SectionHead
                title="Spending by category"
                sub="Where your money went"
              />
              {data?.categories?.length ? (
                <div className="report-category-list">
                  {data.categories
                    .slice()
                    .sort((a, b) => b.value - a.value)
                    .map((x, i) => (
                      <div className="report-category" key={x.name}>
                        <span
                          className="category-color"
                          style={{ background: palette[i % palette.length] }}
                        />
                        <div>
                          <div className="report-category-name">
                            <b>{x.name}</b>
                            <strong>{money(x.value)}</strong>
                          </div>
                          <div className="progress-track">
                            <i
                              style={{
                                width: `${data.total ? (x.value / data.total) * 100 : 0}%`,
                                background: palette[i % palette.length],
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <Empty
                  title="Nothing to break down"
                  description="Category insights appear after your first expense."
                />
              )}
            </Card>
          </div>
          <div className="dashboard-grid report-grid">
            <Card>
              <SectionHead
                title="Learning by subject"
                sub="Minutes invested in each subject"
              />
              {learn?.subjects?.length ? (
                <div className="report-category-list">
                  {learn.subjects.map((x, i) => (
                    <div className="report-category" key={x.name}>
                      <span
                        className="category-color"
                        style={{ background: palette[i % palette.length] }}
                      />
                      <div>
                        <div className="report-category-name">
                          <b>{x.name}</b>
                          <strong>{duration(x.value)}</strong>
                        </div>
                        <div className="progress-track">
                          <i
                            style={{
                              width: `${(x.value / learn.subjects[0].value) * 100}%`,
                              background: palette[i % palette.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No sessions in this period"
                  description="Your learning mix will appear after you log a session."
                />
              )}
            </Card>
            <Card>
              <SectionHead
                title="Period snapshot"
                sub="A few useful things to know"
              />
              <div className="snapshot-list">
                <div>
                  <span>Highest spending day</span>
                  <strong>
                    {data?.highestDay
                      ? niceDate(`${data.highestDay}T12:00:00`)
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Most studied subject</span>
                  <strong>{learn?.subjects?.[0]?.name || "—"}</strong>
                </div>
                <div>
                  <span>Learning sessions</span>
                  <strong>{learn?.sessions || 0}</strong>
                </div>
                <div>
                  <span>Active learning days</span>
                  <strong>{learn?.activeDays || 0}</strong>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Viewers({ onToast }) {
  const [items, setItems] = useState([]),
    [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 }),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("pending_approval"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [pending, setPending] = useState(null),
    [actionBusy, setActionBusy] = useState(false);
  async function load(page = 1) {
    setLoading(true);
    setError("");
    try {
      const result = await api(`/users${qs({ page, limit: 20, search, status })}`);
      setItems(result.items);
      setPagination(result.pagination);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(1); }, [search, status]);
  async function setUserStatus() {
    if (!pending || actionBusy) return;
    const { account, action } = pending;
    setActionBusy(true);
    try {
      await api(`/users/${account._id}/${action}`, { method: "PATCH", body: "{}" });
      const message = { approve: `${account.username} is approved.`, reject: `${account.username} was rejected.`, block: `${account.username} is blocked.` }[action];
      onToast(message);
      setPending(null);
      load(pagination.page);
    } catch (e) { onToast(e.message); }
    finally { setActionBusy(false); }
  }
  async function unblock(account) {
    try {
      await api(`/users/${account._id}/unblock`, { method: "PATCH", body: "{}" });
      onToast(`${account.username} is active again.`);
      load(pagination.page);
    } catch (e) { onToast(e.message); }
  }
  return <>
    <PageTitle eyebrow="ACCOUNT ACCESS" title="User management" description="Review registrations and manage access to private LifeLedger workspaces." />
    <Card className="records-card">
      <div className="filter-bar viewer-filters">
        <div className="search-field"><Search size={16}/><input aria-label="Search users" placeholder="Search usernames…" value={search} onChange={e => setSearch(e.target.value)}/></div>
        <label className="viewer-status-filter">Account status<select value={status} onChange={e => setStatus(e.target.value)}><option value="pending_approval">Pending approval</option><option value="active">Active</option><option value="blocked">Blocked</option><option value="rejected">Rejected</option><option value="all">All users</option></select></label>
        <span className="viewer-count">{pagination.total} {pagination.total === 1 ? "user" : "users"}</span>
      </div>
      {error ? <div className="inline-error">{error}<button onClick={() => load()}>Try again</button></div> : loading ? <div className="table-loading">Loading user accounts…</div> : items.length ? (
        <div className="table-scroll"><table className="users-table"><thead><tr><th>USERNAME</th><th>REGISTERED</th><th>LAST LOGIN</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{items.map(account => <tr key={account._id}>
          <td><div className="managed-user"><span className="avatar">{account.username.slice(0,1).toUpperCase()}</span><strong>{account.username}</strong></div></td>
          <td>{niceDate(account.createdAt)}</td><td>{account.lastLoginAt ? niceDate(account.lastLoginAt) : "Never"}</td>
          <td><span className={`account-status ${account.status}`}><i/>{({ pending_approval: "Pending approval", active: "Active", blocked: "Blocked", rejected: "Rejected" })[account.status]}</span></td>
          <td><div className="user-actions">{account.status === "pending_approval" ? <><button className="btn primary small-btn" onClick={() => setPending({ account, action: "approve" })}>Approve</button><button className="btn block-btn small-btn" onClick={() => setPending({ account, action: "reject" })}>Reject</button></> : account.status === "active" ? <button className="btn block-btn small-btn" onClick={() => setPending({ account, action: "block" })}>Block access</button> : account.status === "blocked" ? <button className="btn secondary small-btn" onClick={() => unblock(account)}>Unblock</button> : <span className="muted">No actions</span>}</div></td>
        </tr>)}</tbody></table></div>
      ) : <Empty icon={Users} title={search ? "No matching users" : status === "pending_approval" ? "No pending registrations" : status === "all" ? "No users yet" : `No ${status.replaceAll("_", " ")} users`} description={search ? "Try a different username search." : status === "pending_approval" ? "New registrations that need your review will appear here." : "Try another status filter."} />}
      <div className="pagination"><span>{pagination.total ? `${(pagination.page - 1) * 20 + 1}–${Math.min(pagination.page * 20, pagination.total)} of ${pagination.total} users` : "0 users"}</span><div><button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)} aria-label="Previous page"><ChevronLeft size={16}/></button><span>Page {pagination.page} of {Math.max(1, pagination.pages)}</span><button disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)} aria-label="Next page"><ChevronRight size={16}/></button></div></div>
    </Card>
    {pending && <ConfirmDialog busy={actionBusy} title={({ approve: "Approve this account?", reject: "Reject this registration?", block: "Block this account?" })[pending.action]} confirmLabel={({ approve: "Approve", reject: "Reject account", block: "Block access" })[pending.action]} text={({ approve: `${pending.account.username} will be able to sign in and use their own private workspace.`, reject: `${pending.account.username} will not be able to sign in. Their account record will be retained.`, block: `${pending.account.username} will lose access to LifeLedger immediately. Their records will be preserved.` })[pending.action]} onClose={() => setPending(null)} onConfirm={setUserStatus}/>}
  </>;
}

function Settings({ settings, onSettings, onToast }) {
  const [form, setForm] = useState(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [newSubject, setNewSubject] = useState("");
  useEffect(() => {
    if (settings)
      setForm({
        monthlyBudget: (settings.monthlyBudgetPaise || 0) / 100,
        dailyGoalMinutes: settings.dailyGoalMinutes || 60,
        weeklyGoalMinutes: settings.weeklyGoalMinutes || 420,
        theme: settings.theme || "light",
        subjects: settings.subjects || subjects,
        categories: settings.categories || categories,
        timezone: settings.timezone || "Asia/Kolkata",
      });
  }, [settings]);
  if (!form) return <div className="table-loading">Loading settings…</div>;
  async function save() {
    setSaving(true);
    setError("");
    try {
      const r = await api("/settings", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      onSettings({ ...settings, ...r.settings });
      onToast("Your preferences have been saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  const backup = async () => {
    try {
      const b = await api("/backup");
      const blob = new Blob([JSON.stringify(b, null, 2)], {
          type: "application/json",
        }),
        a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `lifeledger-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      onToast("Your backup is ready.");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="MAKE IT YOURS"
        title="Settings"
        description="Set the goals and preferences that keep LifeLedger feeling like yours."
        action={
          <button disabled={saving} className="btn primary" onClick={save}>
            <Check size={16} />
            {saving ? "Saving…" : "Save changes"}
          </button>
        }
      />
      {error && <div className="inline-error">{error}</div>}
      <div className="settings-layout">
        <div className="settings-main">
          <Card className="settings-section">
            <div className="settings-section-icon blue">
              <Wallet size={18} />
            </div>
            <div className="settings-section-body">
              <h2>Monthly budget</h2>
              <p>
                Choose a monthly spending limit. We’ll let you know as you get
                close.
              </p>
              <label className="settings-input-label">
                Monthly budget{" "}
                <span className="input-prefix">
                  <b>₹</b>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={form.monthlyBudget}
                    onChange={(e) =>
                      update("monthlyBudget", Number(e.target.value))
                    }
                  />
                </span>
              </label>
              <span className="field-help">
                A gentle nudge appears when you reach 80% of your budget.
              </span>
            </div>
          </Card>
          <Card className="settings-section">
            <div className="settings-section-icon purple">
              <BookOpen size={18} />
            </div>
            <div className="settings-section-body">
              <h2>Learning goals</h2>
              <p>Set a daily and weekly rhythm that works for you.</p>
              <div className="settings-two">
                <label>
                  Daily learning goal{" "}
                  <span className="input-suffix">
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={form.dailyGoalMinutes}
                      onChange={(e) =>
                        update("dailyGoalMinutes", Number(e.target.value))
                      }
                    />
                    <b>min / day</b>
                  </span>
                </label>
                <label>
                  Weekly learning goal{" "}
                  <span className="input-suffix">
                    <input
                      type="number"
                      min="1"
                      max="10080"
                      value={form.weeklyGoalMinutes}
                      onChange={(e) =>
                        update("weeklyGoalMinutes", Number(e.target.value))
                      }
                    />
                    <b>min / week</b>
                  </span>
                </label>
              </div>
            </div>
          </Card>
          <Card className="settings-section">
            <div className="settings-section-icon orange">
              <Sparkles size={18} />
            </div>
            <div className="settings-section-body">
              <h2>Subjects</h2>
              <p>Keep the subjects you care about close at hand.</p>
              <div className="tag-list">
                {form.subjects.map((x) => (
                  <span className="config-tag" key={x}>
                    {x}
                    <button
                      onClick={() =>
                        update(
                          "subjects",
                          form.subjects.filter((s) => s !== x),
                        )
                      }
                      aria-label={`Remove ${x}`}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="add-tag">
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Add a subject"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (
                        newSubject.trim() &&
                        !form.subjects.includes(newSubject.trim())
                      )
                        update("subjects", [
                          ...form.subjects,
                          newSubject.trim(),
                        ]);
                      setNewSubject("");
                    }
                  }}
                />
                <button
                  className="btn secondary small-btn"
                  onClick={() => {
                    if (
                      newSubject.trim() &&
                      !form.subjects.includes(newSubject.trim())
                    )
                      update("subjects", [...form.subjects, newSubject.trim()]);
                    setNewSubject("");
                  }}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </Card>
          <Card className="settings-section">
            <div className="settings-section-icon green">
              <Download size={18} />
            </div>
            <div className="settings-section-body">
              <h2>Your data, always yours</h2>
              <p>
                Download a complete backup of your expenses, learning sessions,
                reflections, and preferences.
              </p>
              <button className="btn secondary" onClick={backup}>
                <Download size={16} /> Download JSON backup
              </button>
              <span className="field-help">
                Backups never include your password or session details.
              </span>
            </div>
          </Card>
        </div>
        <div className="settings-side">
          <Card className="appearance-card">
            <div className="eyebrow">APPEARANCE</div>
            <h2>Make yourself at home.</h2>
            <p>Choose the look that feels right today.</p>
            <div className="theme-options">
              <button
                className={form.theme === "light" ? "theme-active" : ""}
                onClick={() => update("theme", "light")}
              >
                <Sun size={19} />
                <span>Light</span>
              </button>
              <button
                className={form.theme === "dark" ? "theme-active" : ""}
                onClick={() => update("theme", "dark")}
              >
                <Moon size={19} />
                <span>Dark</span>
              </button>
            </div>
          </Card>
          <Card className="timezone-card">
            <div className="eyebrow">TIME & PLACE</div>
            <h2>Your timezone</h2>
            <p>All dates and reports follow your local calendar.</p>
            <div className="timezone-value">
              <span>Asia / Kolkata</span>
              <span>UTC +05:30</span>
            </div>
          </Card>
          <div className="private-note">
            <span className="secure-dot" />
            <div>
              <strong>Your data stays yours.</strong>
              <p>Your personal records are private and protected by sign in.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
export default App;
