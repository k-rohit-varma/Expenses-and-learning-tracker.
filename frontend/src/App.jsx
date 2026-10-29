import React, { useEffect, useMemo, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Code2,
  Languages,
  Brain,
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
  ReferenceLine,
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
const addDays = (key, days) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const monday = (key) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};
const OWNER_DISPLAY_NAME = "Rohit Varma Kunaparaju";
const EMPTY_SUBJECTS = [];
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
  ["/budget", "Budget", Activity],
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
            <Route path="/budget" element={<BudgetPage onToast={setToast} />} />
            <Route
              path="/learning/subjects/:subjectId"
              element={<LearningSubjectPage onToast={setToast} settings={settings} />}
            />
            <Route
              path="/learning"
              element={<Learning onToast={setToast} />}
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
      else {
        // Confirm Safari stored and returned the cookie before entering the app.
        const { user: authenticatedUser } = await api("/auth/me");
        onLogin(authenticatedUser);
      }
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
  const [selectedWeek, setSelectedWeek] = useState(() => monday(today));
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [review, setReview] = useState("");
  async function refresh() {
    try {
      const summary = await api("/dashboard/summary");
      setData(summary);
      if (selectedWeek === monday(today)) setWeeklyReport(summary.weeklyBudget);
      else {
        const weekly = await api(`/budgets/weekly${qs({ weekStart: selectedWeek })}`);
        setWeeklyReport(weekly.report);
      }
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    api(`/daily-reviews/${today}`)
      .then((r) => setReview(r.item.reflection || ""))
      .catch(() => {});
  }, [selectedWeek]);
  useEffect(() => { refresh(); }, [selectedWeek]);
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
      <WeeklyOverview
        report={weeklyReport}
        weekStart={selectedWeek}
        onWeekChange={(delta) => setSelectedWeek((week) => addDays(week, delta * 7))}
        onCurrentWeek={() => setSelectedWeek(monday(today))}
        onManage={() => onNavigate("/budget", { state: { weekStart: selectedWeek } })}
      />
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

function budgetMessage(report) {
  if (!report || report.budget === null) return "Set a weekly budget to see your progress here.";
  const pct = report.percentUsed || 0;
  if (report.spent === 0) return "No spending yet this week.";
  if (report.remaining < 0) return `You've exceeded your weekly budget by ${money(Math.abs(report.remaining))}.`;
  if (pct >= 100) return "Your weekly budget is fully used.";
  if (pct >= 80) return `You've used ${Math.floor(pct)}% of your weekly budget. Consider limiting non-essential spending.`;
  if (pct >= 50) return `You've used ${Math.floor(pct)}% of your weekly budget. Keep an eye on the remaining amount.`;
  return `You've used ${Math.floor(pct)}% of your weekly budget. You're within budget.`;
}

function WeeklyOverview({ report, weekStart, onWeekChange, onCurrentWeek, onManage }) {
  const budgetSet = report?.budget !== null && report?.budget !== undefined;
  const pct = report?.percentUsed ?? 0;
  const visualPct = Math.min(100, Math.max(0, pct));
  const color = pct >= 100 ? "#dc686a" : pct >= 80 ? "#e6a442" : "#6481e7";
  const end = report?.weekEnd || addDays(weekStart, 6);
  return (
    <Card className="weekly-overview">
      <div className="weekly-overview-head">
        <div>
          <span className="eyebrow">WEEKLY BUDGET OVERVIEW</span>
          <h2>{niceDate(`${weekStart}T12:00:00`)} – {niceDate(`${end}T12:00:00`)}</h2>
        </div>
        <div className="week-nav">
          <button className="icon-btn small" aria-label="Previous week" onClick={() => onWeekChange(-1)}><ChevronLeft size={16} /></button>
          <button className="text-btn" onClick={onCurrentWeek}>This week</button>
          <button className="icon-btn small" aria-label="Next week" onClick={() => onWeekChange(1)}><ChevronRight size={16} /></button>
        </div>
      </div>
      {!report ? <div className="table-loading">Loading weekly budget…</div> : !budgetSet ? (
        <div className="weekly-empty"><p>No budget configured for this week.</p><button className="btn primary small-btn" onClick={onManage}>Set weekly budget</button></div>
      ) : (
        <>
          <div className="weekly-overview-metrics">
            <div><span>Weekly budget</span><strong>{money(report.budget)}</strong></div>
            <div><span>Spent</span><strong>{money(report.spent)}</strong></div>
            <div><span>{report.remaining < 0 ? "Over budget" : "Remaining"}</span><strong>{money(Math.abs(report.remaining))}{report.remaining < 0 ? " over" : ""}</strong></div>
            <div><span>Used</span><strong>{Math.floor(pct)}%</strong></div>
          </div>
          <div className="budget-progress" role="progressbar" aria-label="Weekly budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow={visualPct} aria-valuetext={`${Math.floor(pct)}% used`}>
            <i style={{ width: `${visualPct}%`, background: color }} />
          </div>
          <div className={`budget-insight ${pct >= 80 ? "warning" : ""}`} role="status">{budgetMessage(report)}</div>
          <div className="weekly-overview-foot">
            <span>{report.dailyAllowance !== null ? `${money(report.dailyAllowance)} available per remaining day` : report.remainingDays === 0 ? "Week complete · final result shown" : "No budget remains for additional spending"}</span>
            <button className="text-btn" onClick={onManage}>Manage and view report <ChevronRight size={15} /></button>
          </div>
        </>
      )}
    </Card>
  );
}

function BudgetPage({ onToast }) {
  const location = useLocation();
  const [weekStart, setWeekStart] = useState(() => monday(location.state?.weekStart || today));
  const [report, setReport] = useState(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const currentWeek = monday(today);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api(`/budgets/weekly${qs({ weekStart })}`);
      setReport(result.report);
      setAmount(result.report.budget === null ? "" : String(result.report.budget));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [weekStart]);
  async function save() {
    const value = amount === "" ? NaN : Number(amount);
    if (!Number.isFinite(value) || value < 0 || value > 100000000) {
      setError("Enter a valid non-negative budget amount.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await api("/budgets/weekly", { method: "PUT", body: JSON.stringify({ weekStart, amount: value }) });
      setReport(result.report);
      setAmount(String(result.report.budget));
      onToast("Weekly budget saved.");
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  const end = addDays(weekStart, 6);
  const budgetSet = report?.budget !== null && report?.budget !== undefined;
  return <>
    <PageTitle eyebrow="SPEND WITH INTENTION" title="Weekly budget" description="Set a limit for each week and see where your spending goes." action={<button className="btn secondary" onClick={() => setWeekStart(currentWeek)}>Current week</button>} />
    <div className="budget-week-controls">
      <button className="btn secondary" onClick={() => setWeekStart((week) => addDays(week, -7))}><ChevronLeft size={16} /> Previous week</button>
      <strong>{niceDate(`${weekStart}T12:00:00`)} – {niceDate(`${end}T12:00:00`)}</strong>
      <button className="btn secondary" onClick={() => setWeekStart((week) => addDays(week, 7))}>Next week <ChevronRight size={16} /></button>
    </div>
    {error && <div className="inline-error">{error}</div>}
    {loading || !report ? <div className="table-loading">Loading weekly budget…</div> : <>
      <div className="stat-grid budget-stats">
        <Stat label="Weekly budget" value={budgetSet ? money(report.budget) : "Not set"} sub="Selected Monday–Sunday week" icon={Wallet} color="blue" />
        <Stat label="Spent this week" value={money(report.spent)} sub={`${report.expenseCount} expenses`} icon={WalletCards} color="purple" />
        <Stat label={report.remaining < 0 ? "Over budget" : "Remaining"} value={budgetSet ? money(Math.abs(report.remaining)) : "—"} sub={report.remaining < 0 ? "Over the configured limit" : "Available in this week"} icon={Activity} color={report.remaining < 0 ? "orange" : "green"} />
        <Stat label="Budget used" value={budgetSet ? `${Math.floor(report.percentUsed || 0)}%` : "—"} sub={budgetSet ? budgetMessage(report) : "Set a budget to track progress"} icon={ChartNoAxesCombined} color={report.percentUsed >= 80 ? "orange" : "blue"} />
      </div>
      <Card className="budget-editor">
        <div><h2>{budgetSet ? "Update this week’s budget" : "Set a budget for this week"}</h2><p>{budgetSet ? "Changing the amount updates the report immediately." : "No default amount is created. Choose the limit that works for you."}</p></div>
        <label>Weekly budget <span className="input-prefix"><b>₹</b><input aria-label="Weekly budget amount" type="number" min="0" max="100000000" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" /></span></label>
        <button className="btn primary" disabled={saving} onClick={save}><Check size={15} /> {saving ? "Saving…" : "Save budget"}</button>
      </Card>
      {!budgetSet && <Card className="weekly-empty-card"><h2>No budget configured</h2><p>Weekly spending is {money(report.spent)} across {report.expenseCount} expenses. Set a budget above to see remaining funds and progress.</p></Card>}
      {budgetSet && <>
        <div className="budget-progress-detail">
          <div className="weekly-overview-head"><div><span className="eyebrow">WEEKLY PROGRESS</span><h2>{Math.floor(report.percentUsed || 0)}% used</h2></div><strong>{budgetMessage(report)}</strong></div>
          <div className="budget-progress large" role="progressbar" aria-label="Weekly budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, Math.max(0, report.percentUsed || 0))} aria-valuetext={`${Math.floor(report.percentUsed || 0)}% used`}><i style={{ width: `${Math.min(100, Math.max(0, report.percentUsed || 0))}%`, background: report.percentUsed >= 80 ? "#dc686a" : "#6481e7" }} /></div>
          <div className="weekly-overview-foot"><span>{report.dailyAllowance !== null ? `${money(report.dailyAllowance)} available per remaining day` : report.remainingDays === 0 ? "Week complete · final result shown" : "No budget remains for additional spending"}</span><span>{report.remaining < 0 ? `${money(Math.abs(report.remaining))} over budget` : `${money(report.remaining)} remaining`}</span></div>
        </div>
        <div className="dashboard-grid report-grid">
          <Card><SectionHead title="Spending by category" sub="Share of this week’s spending" />{report.categories.length ? <div className="report-category-list">{report.categories.map((item, i) => <div className="report-category" key={item.name}><span className="category-color" style={{ background: palette[i % palette.length] }} /><div><div className="report-category-name"><b>{item.name}</b><strong>{money(item.amount)} · {item.percent.toFixed(0)}% · {item.count} {item.count === 1 ? "expense" : "expenses"}</strong></div><div className="progress-track"><i style={{ width: `${item.percent}%`, background: palette[i % palette.length] }} /></div></div></div>)}</div> : <Empty title="No spending this week" description="Category details will appear after an expense is added." />}</Card>
          <Card><SectionHead title="Daily spending" sub="All seven days, including days with no spending" /><ResponsiveContainer width="100%" height={265}><BarChart data={report.daily} margin={{ left: -15, right: 4, top: 12, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" /><XAxis dataKey="date" tickFormatter={(date) => new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted)" }} /><YAxis tickFormatter={compactMoney} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted)" }} /><Tooltip formatter={(value) => money(value)} labelFormatter={(date) => niceDate(`${date}T12:00:00`)} /><ReferenceLine y={report.budget / 7} stroke="#d79b4a" strokeDasharray="5 4" label={{ value: "Daily budget guide", fill: "var(--muted)", fontSize: 9 }} /><Bar dataKey="amount" name="Spent" fill="#6984e8" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Card>
        </div>
      </>}
      <Card className="weekly-comparison"><SectionHead title="Compared with last week" sub={`${money(report.previousSpent)} spent the previous week`} /><div><strong>{report.difference === 0 ? "Spending was unchanged" : report.difference > 0 ? `${money(report.difference)} more spent` : `${money(Math.abs(report.difference))} less spent`}</strong><span>{report.changePercent === null ? "No percentage comparison because last week had no spending." : `${Math.abs(report.changePercent).toFixed(1)}% ${report.changePercent > 0 ? "higher" : report.changePercent < 0 ? "lower" : "change"} than last week.`}</span></div><p>Average daily spending: <strong>{money(report.averageDaily)}</strong></p><p>Largest category this week: <strong>{report.categories[0]?.name || "No spending recorded"}</strong></p></Card>
    </>}
  </>;
}

function RecordModal({
  type,
  onClose,
  onToast,
  onSaved,
  initial = null,
  settings,
  learningSubjects = EMPTY_SUBJECTS,
  presetSubjectId = "",
}) {
  const navigate = useNavigate();
  const isExpense = type === "expense",
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [availableSubjects, setAvailableSubjects] = useState(learningSubjects);
  useEffect(() => {
    setAvailableSubjects(learningSubjects);
    if (!isExpense && !learningSubjects.length) {
      api("/learning/subjects").then((result) => setAvailableSubjects(result.items)).catch(() => {});
    }
  }, [isExpense, learningSubjects]);
  const categoryOptions = settings?.categories?.length ? settings.categories : categories;
  const subjectOptions = availableSubjects.filter((item) => !item.archived || item._id === initial?.subjectId);
  const [form, setForm] = useState(
    initial || {
      amount: "",
      category: categoryOptions[0],
      description: "",
      transactionDate: `${today}T12:00`,
      paymentMethod: "UPI",
      notes: "",
      subjectId: initial?.subjectId || presetSubjectId || subjectOptions.find((item) => !item.archived)?._id || "",
      topic: "",
      durationMinutes: "",
      sessionDate: `${today}T12:00`,
      whatILearned: "",
      problemsSolved: "",
      tasksCompleted: "",
      difficulty: "",
    },
  );
  useEffect(() => {
    if (!isExpense && !initial && !form.subjectId) {
      const first = availableSubjects.find((item) => !item.archived);
      if (first) setForm((current) => ({ ...current, subjectId: first._id }));
    }
  }, [availableSubjects, form.subjectId, initial, isExpense]);
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
          subjectId: form.subjectId,
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
                    required
                    value={form.subjectId}
                    onChange={(e) => change("subjectId", e.target.value)}
                  >
                    <option value="">Choose a subject</option>
                    {subjectOptions.map((x) => (
                      <option key={x._id} value={x._id}>{x.name}{x.archived ? " (archived)" : ""}</option>
                    ))}
                  </select>
                </label>
                {!subjectOptions.some((item) => !item.archived) && !initial && <div className="wide-field subject-required-note">Create an active subject before logging a session. <button type="button" className="text-btn" onClick={() => { onClose(); navigate("/learning"); }}>Create a subject</button></div>}
                <label>
                  Topic
                  <input
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
            <button disabled={busy || (!isExpense && !form.subjectId)} className="btn primary">
              <Check size={16} />
              {busy ? "Saving…" : isExpense ? "Save expense" : "Save session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RecordList({ type, items, onEdit, onDelete, learningSubjects = EMPTY_SUBJECTS }) {
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
                {!exp && x.notes && (
                  <div className="table-secondary">{x.notes}</div>
                )}
              </td>
              <td>
                <span className="pill" style={!exp ? (() => { const subject = learningSubjects.find((item) => item._id === x.subjectId); return subject ? { color: subject.color, background: `${subject.color}1c` } : {}; })() : undefined}>{exp ? x.category : x.subject}</span>
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
function RecordsPage({ type, onToast, settings, fixedSubjectId = "", onChanged }) {
  const exp = type === "expense",
    [items, setItems] = useState([]),
    [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 }),
    [filters, setFilters] = useState({
      search: "",
      from: "",
      to: "",
      category: "",
      subjectId: "",
      paymentMethod: "",
      minAmount: "",
      maxAmount: "",
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [modal, setModal] = useState(false),
    [editing, setEditing] = useState(null),
    [confirm, setConfirm] = useState(null);
  const [learningSubjects, setLearningSubjects] = useState([]);
  const endpoint = exp ? "expenses" : "learning";
  useEffect(() => {
    if (!exp) api("/learning/subjects").then((result) => setLearningSubjects(result.items)).catch(() => {});
  }, [exp]);
  async function load(page = 1) {
    setLoading(true);
    setError("");
    try {
      const f = { ...filters, page, limit: 20 };
      if (exp) {
        delete f.subjectId;
      } else {
        delete f.category;
        delete f.paymentMethod;
        delete f.minAmount;
        delete f.maxAmount;
        if (fixedSubjectId) f.subjectId = fixedSubjectId;
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
  }, [type, filters, fixedSubjectId]);
  async function remove() {
    try {
      await api(`/${endpoint}/${confirm._id}`, { method: "DELETE" });
      onToast(exp ? "Expense deleted." : "Session deleted.");
      setConfirm(null);
      load(pagination.page);
      onChanged?.();
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
      subjectId: "",
      paymentMethod: "",
      minAmount: "",
      maxAmount: "",
    });
  return (
    <>
      <PageTitle
        eyebrow={exp ? "MONEY, MADE CLEAR" : "LEARNING, MADE VISIBLE"}
        title={exp ? "Expenses" : fixedSubjectId ? "Learning history" : "Learning log"}
        description={
          exp
            ? "Keep track of the little things and the bigger picture."
            : fixedSubjectId ? "Review or add sessions for this subject." : "A record of what you are learning, one session at a time."
        }
        action={
          <button
            id={fixedSubjectId ? "subject-session-add" : undefined}
            disabled={Boolean(fixedSubjectId && learningSubjects.find((item) => item._id === fixedSubjectId)?.archived)}
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
              value={fixedSubjectId || filters.subjectId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, subjectId: e.target.value }))
              }
              disabled={Boolean(fixedSubjectId)}
            >
              <option value="">All subjects</option>
              {learningSubjects.filter((item) => !item.archived).map((x) => (
                <option key={x._id} value={x._id}>{x.name}</option>
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
            learningSubjects={learningSubjects}
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
          learningSubjects={learningSubjects}
          presetSubjectId={fixedSubjectId}
          onClose={() => setModal(false)}
          onToast={onToast}
          onSaved={() => { load(pagination.page); onChanged?.(); }}
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
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [overview, setOverview] = useState(null);
  const [range, setRange] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const loadSubjects = async () => {
    setSubjectsLoading(true);
    try { setItems((await api("/learning/subjects")).items); setError(""); }
    catch (e) { setError(e.message); }
    finally { setSubjectsLoading(false); }
  };
  useEffect(() => { loadSubjects(); }, []);
  const overviewQuery = range === "custom"
    ? qs({ from: customFrom, to: customTo })
    : qs({ range });
  useEffect(() => {
    if (range === "custom" && (!customFrom || !customTo)) return;
    api(`/learning/overview${overviewQuery}`).then(setOverview).catch((e) => setError(e.message));
  }, [overviewQuery, range, customFrom, customTo]);
  async function saveSubject(subject) {
    try {
      await api(`/learning/subjects${editing?._id ? `/${editing._id}` : ""}`, {
        method: editing?._id ? "PATCH" : "POST",
        body: JSON.stringify(subject),
      });
      setEditing(null);
      props.onToast(editing?._id ? "Subject updated." : "Subject created.");
      await loadSubjects();
    } catch (e) { setError(e.message); throw e; }
  }
  async function archiveSubject(subject) {
    try {
      await api(`/learning/subjects/${subject._id}`, { method: "PATCH", body: JSON.stringify({ archived: !subject.archived }) });
      props.onToast(subject.archived ? "Subject restored." : "Subject archived.");
      await loadSubjects();
    } catch (e) { setError(e.message); }
  }
  const active = items.filter((item) => !item.archived);
  const visibleItems = showArchived ? items.filter((item) => item.archived) : active;
  return <>
    <PageTitle eyebrow="LEARNING, MADE VISIBLE" title="Learning" description="Organize your progress by subject and make every session count." action={<button className="btn primary" onClick={() => setEditing({})}><Plus size={16} /> Create subject</button>} />
    {error && <div className="inline-error">{error}</div>}
    <div className="stat-grid learning-stats">
      <Stat label="Total learning time" value={overview ? duration(overview.allTimeMinutes) : "—"} sub={`${overview?.allTimeSessions || 0} sessions across all subjects`} icon={Clock3} color="blue" />
      <Stat label="This week" value={overview ? duration(overview.weekMinutes) : "—"} sub="Monday through today" icon={CalendarDays} color="purple" />
      <Stat label="This month" value={overview ? duration(overview.monthMinutes) : "—"} sub="Learning time recorded" icon={BookOpen} color="green" />
      <Stat label="Most studied" value={overview?.mostStudied?.name || "—"} sub={overview?.mostStudied ? duration(overview.mostStudied.minutes) : "Record a session to see your focus"} icon={Sparkles} color="orange" />
    </div>
    <Card className="learning-analytics-card">
      <div className="learning-analytics-head"><SectionHead title="Learning analytics" sub={`${overview?.sessions || 0} sessions · ${duration(overview?.totalMinutes || 0)} in this range`} /><select aria-label="Learning analytics range" value={range} onChange={(e) => setRange(e.target.value)}><option value="week">This week</option><option value="month">This month</option><option value="30d">Last 30 days</option><option value="all">All time</option><option value="custom">Custom dates</option></select></div>
      {range === "custom" && <div className="learning-custom-dates"><label>From <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label><label>To <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label></div>}
      {overview?.bySubject?.length ? <div className="learning-analytics-grid"><div className="learning-subject-bars">{overview.bySubject.map((item) => <div key={item.subjectId} className="subject-bar-row"><div className="subject-bar-label"><span><i style={{ background: item.color }} />{item.name}</span><strong>{duration(item.minutes)}</strong></div><div className="bar-track"><i style={{ width: `${Math.max(4, item.minutes / overview.bySubject[0].minutes * 100)}%`, background: item.color }} /></div></div>)}</div><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={overview.bySubject} dataKey="minutes" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3}><Cell fill={overview.bySubject[0]?.color} />{overview.bySubject.slice(1).map((item) => <Cell key={item.subjectId} fill={item.color} />)}</Pie><Tooltip formatter={(value) => duration(value)} /></PieChart></ResponsiveContainer></div> : <div className="learning-chart-empty">No sessions in this date range yet.</div>}
    </Card>
    <div className="learning-subject-section-head"><div><h2>Your subjects</h2><p>{active.length} active {active.length === 1 ? "subject" : "subjects"}</p></div><button className="text-btn" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Show active subjects" : `Archived (${items.length - active.length})`}</button></div>
    {subjectsLoading ? <div className="table-loading">Loading learning subjects…</div> : visibleItems.length ? <div className="learning-subject-grid">{visibleItems.map((subject) => {
      const Icon = subjectIcons[subject.icon] || BookOpen;
      const progress = subject.weeklyGoalMinutes ? Math.min(100, subject.weekMinutes / subject.weeklyGoalMinutes * 100) : null;
      return <Card className="learning-subject-card" key={subject._id}>
        <button className="subject-card-open" onClick={() => navigate(`/learning/subjects/${subject._id}`)} aria-label={`Open ${subject.name}`}>
          <span className="subject-card-icon" style={{ color: subject.color, background: `${subject.color}1c` }}><Icon size={20} /></span><span className="subject-card-identity"><strong>{subject.name}</strong><small>{subject.description || "Learning subject"}</small></span>
        </button>
        <div className="subject-card-stats"><div><span>Total time</span><strong>{duration(subject.totalMinutes)}</strong></div><div><span>Sessions</span><strong>{subject.sessionCount}</strong></div><div><span>This week</span><strong>{duration(subject.weekMinutes)}</strong></div><div><span>Last studied</span><strong>{subject.lastStudied ? relativeStudyDate(subject.lastStudied) : "Not yet"}</strong></div></div>
        {progress !== null && <div className="subject-goal"><div><span>Weekly goal</span><strong>{Math.floor(progress)}% · {duration(subject.weeklyGoalMinutes)} goal</strong></div><div className="bar-track"><i style={{ width: `${progress}%`, background: subject.color }} /></div></div>}
        <div className="subject-card-actions"><button className="text-btn" onClick={() => navigate(`/learning/subjects/${subject._id}`)}>Open subject <ChevronRight size={15} /></button><button className="icon-btn small" aria-label={`Edit ${subject.name}`} onClick={() => setEditing(subject)}><Edit2 size={14} /></button><button className="text-btn archive-subject-btn" onClick={() => archiveSubject(subject)}>{subject.archived ? "Restore" : "Archive"}</button></div>
      </Card>;
    })}</div> : <Card className="learning-empty"><span className="empty-icon"><BookOpen size={22} /></span><h2>{showArchived ? "No archived subjects" : "Start with a subject"}</h2><p>Create subjects such as Java, Japanese, or Data Structures, then log sessions under each one.</p>{!showArchived && <button className="btn primary" onClick={() => setEditing({})}><Plus size={16} /> Create your first subject</button>}</Card>}
    {editing && <SubjectEditor subject={editing._id ? editing : null} onClose={() => setEditing(null)} onSave={saveSubject} />}
  </>;
}

const subjectIcons = { BookOpen, Code2, Languages, Wallet, Brain, Sparkles };
function relativeStudyDate(value) {
  const key = dateKey(value);
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  return niceDate(value);
}
function SubjectEditor({ subject, onClose, onSave }) {
  const [form, setForm] = useState({ name: subject?.name || "", description: subject?.description || "", icon: subject?.icon || "BookOpen", color: subject?.color || "#637ee8", weeklyGoalMinutes: subject?.weeklyGoalMinutes || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onSave({ ...form, weeklyGoalMinutes: form.weeklyGoalMinutes === "" ? null : Number(form.weeklyGoalMinutes) }); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="subject-editor-title"><div className="modal-head"><div><div className="eyebrow">LEARNING TRACK</div><h2 id="subject-editor-title">{subject ? "Edit subject" : "Create subject"}</h2></div><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></div><form onSubmit={submit}><div className="modal-fields"><label>Name<input required maxLength="60" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Java" /></label><label>Icon<select value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>{Object.keys(subjectIcons).map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label><label className="wide-field">Description <span className="optional">Optional</span><textarea rows="2" maxLength="500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What do you want to learn?" /></label><label>Color<input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label><label>Weekly goal <span className="input-suffix"><input type="number" min="1" max="10080" step="1" value={form.weeklyGoalMinutes} onChange={(e) => setForm({ ...form, weeklyGoalMinutes: e.target.value })} placeholder="Optional" /><b>min / week</b></span></label></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save subject"}</button></div></form></div></div>;
}
function LearningSubjectPage({ onToast, settings }) {
  const { subjectId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const load = async () => { try { setData(await api(`/learning/subjects/${subjectId}`)); setError(""); } catch (e) { setError(e.message); } };
  useEffect(() => { load(); }, [subjectId]);
  if (!data) return error ? <div className="inline-error">{error}<button onClick={load}>Try again</button></div> : <div className="table-loading">Loading subject…</div>;
  const { subject } = data;
  const Icon = subjectIcons[subject.icon] || BookOpen;
  return <>
    <PageTitle eyebrow="SUBJECT LEARNING TRACK" title={subject.name} description={subject.description || "Your sessions and progress in this subject."} action={<><button className="btn secondary" onClick={() => setEditing(true)}><Edit2 size={14} /> Edit subject</button><button className="btn primary" disabled={subject.archived} onClick={() => document.getElementById("subject-session-add")?.click()}><Plus size={15} /> Add session</button></>} />
    <div className="subject-detail-banner"><span className="subject-card-icon large" style={{ color: subject.color, background: `${subject.color}1c` }}><Icon size={25} /></span><div><span className="eyebrow">SUBJECT OVERVIEW</span><h2>{subject.name}</h2><p>{subject.description || "No description added."}</p><p className="subject-latest">Most recent: {data.recentSession ? `${data.recentSession.topic || "Learning session"} · ${niceDate(data.recentSession.sessionDate)}` : "No session recorded yet."}</p></div>{subject.weeklyGoalMinutes && <div className="subject-detail-goal"><span>This week’s goal</span><strong>{duration(subject.weekMinutes)} / {duration(subject.weeklyGoalMinutes)}</strong><div className="bar-track"><i style={{ width: `${Math.min(100, subject.weekMinutes / subject.weeklyGoalMinutes * 100)}%`, background: subject.color }} /></div></div>}</div>
    <div className="stat-grid learning-stats"><Stat label="Total time invested" value={duration(subject.totalMinutes)} sub="Across all sessions" icon={Clock3} color="blue" /><Stat label="Sessions" value={subject.sessionCount} sub={subject.lastStudied ? `Last studied ${relativeStudyDate(subject.lastStudied)}` : "No sessions recorded"} icon={BookOpen} color="purple" /><Stat label="This week" value={duration(subject.weekMinutes)} sub="Monday through today" icon={CalendarDays} color="green" /><Stat label="This month" value={duration(subject.monthMinutes)} sub="Learning time recorded" icon={Sparkles} color="orange" /></div>
    <div className="dashboard-grid report-grid subject-chart-grid"><Card><SectionHead title="Daily learning this week" sub="Minutes invested each day" /><ResponsiveContainer width="100%" height={240}><BarChart data={data.dailyTrend}><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" /><XAxis dataKey="date" tickFormatter={(value) => new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))} tickLine={false} axisLine={false} /><YAxis /><Tooltip formatter={(value) => duration(value)} /><Bar dataKey="minutes" name="Learning" fill={subject.color} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Card><Card><SectionHead title="Weekly trend" sub="Last eight weeks" /><ResponsiveContainer width="100%" height={240}><AreaChart data={data.weeklyTrend}><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" /><XAxis dataKey="weekStart" tickFormatter={(value) => niceDate(`${value}T12:00:00`).split(",")[0]} tickLine={false} axisLine={false} /><YAxis /><Tooltip formatter={(value) => duration(value)} /><Area dataKey="minutes" name="Learning" stroke={subject.color} fill={subject.color} fillOpacity={0.16} /></AreaChart></ResponsiveContainer></Card><Card><SectionHead title="Monthly trend" sub="Last six months" /><ResponsiveContainer width="100%" height={240}><BarChart data={data.monthlyTrend}><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" /><XAxis dataKey="month" tickFormatter={(value) => new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(`${value}-15T12:00:00Z`))} tickLine={false} axisLine={false} /><YAxis /><Tooltip formatter={(value) => duration(value)} /><Bar dataKey="minutes" name="Learning" fill={subject.color} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Card></div>
    <div className="subject-history-head"><div><h2>Learning history</h2><p>Sessions for {subject.name}, newest first.</p></div></div>
    <RecordsPage type="learning" onToast={onToast} settings={settings} fixedSubjectId={subject._id} onChanged={load} />
    {editing && <SubjectEditor subject={subject} onClose={() => setEditing(false)} onSave={async (values) => { await api(`/learning/subjects/${subject._id}`, { method: "PATCH", body: JSON.stringify(values) }); setEditing(false); onToast("Subject updated."); load(); }} />}
  </>;
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
  const navigate = useNavigate();
  const [form, setForm] = useState(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (settings)
      setForm({
        monthlyBudget: (settings.monthlyBudgetPaise || 0) / 100,
        dailyGoalMinutes: settings.dailyGoalMinutes || 60,
        weeklyGoalMinutes: settings.weeklyGoalMinutes || 420,
        theme: settings.theme || "light",
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
              <h2>Learning subjects</h2>
              <p>Create, organize, and archive your learning tracks from the Learning page.</p>
              <button className="btn secondary" onClick={() => navigate("/learning")}>Manage learning subjects <ChevronRight size={15} /></button>
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
