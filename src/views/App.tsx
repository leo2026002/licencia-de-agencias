import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Monitor,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShieldX,
  Sparkles,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  dateLabel,
  expiryFromDays,
  filterLicenses,
  statusOf,
  type AppInput,
  type Application,
  type Data,
  type License,
  type LicenseInput,
  type ValidationResult,
} from "../models/domain";
import {
  addDemoApp,
  addDemoLicense,
  loadDemo,
  saveDemo,
  validateDemo,
} from "../services/demo";
import {
  api,
  checkConnection,
  connect,
  friendlyError,
  readConnection,
  saveConnection,
  type Connection,
} from "../services/supabase";
import {
  synchronizeCatalog,
  type SyncStatus,
} from "../services/synchronization";
import {
  copyText,
  observeNativeLifecycle,
  saveCsv,
} from "../services/platform";

type Page = "dashboard" | "licenses" | "apps" | "devices" | "settings";
const EMPTY: Data = { applications: [], licenses: [], activations: [] };
const PAGES = {
  dashboard: "Vista general",
  licenses: "Licencias",
  apps: "Aplicaciones",
  devices: "Equipos",
  settings: "Configuración",
};
const COLORS = [
  "#818CF8",
  "#34D399",
  "#FBBF24",
  "#FB7185",
  "#38BDF8",
  "#C084FC",
];
const STATUS = { activa: "Activa", expirada: "Expirada", revocada: "Revocada" };

function Badge({ license }: { license: License }) {
  const status = statusOf(license);
  return (
    <span className={`badge ${status}`}>
      <i />
      {STATUS[status]}
    </span>
  );
}
function AppMark({
  app,
  small = false,
}: {
  app?: Application;
  small?: boolean;
}) {
  return (
    <span
      className={`app-mark ${small ? "small" : ""}`}
      style={{
        color: app?.color || COLORS[0],
        background: `${app?.color || COLORS[0]}17`,
      }}
    >
      <Boxes size={small ? 17 : 23} />
    </span>
  );
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <KeyRound size={25} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(
      () =>
        ref.current?.querySelector<HTMLElement>("input,select,button")?.focus(),
      0,
    );
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab") return;
      const items = [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ) || []),
      ];
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", key);
      document.body.style.overflow = original;
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <h2 id={id}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="icon-button" onClick={close} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<Connection | null>(readConnection);
  const client = useMemo(() => {
    try {
      return config ? connect(config) : null;
    } catch {
      return null;
    }
  }, [config]);
  const demo = !client;
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Data>(() => (config ? EMPTY : loadDemo()));
  const [page, setPage] = useState<Page>("dashboard");
  const [loaded, setLoaded] = useState(!config);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<"app" | "license" | "validate" | null>(
    null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [appFilter, setAppFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pagination, setPagination] = useState(1);
  const [navOpen, setNavOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const synchronizer = useRef<ReturnType<typeof synchronizeCatalog> | null>(
    null,
  );
  const [, updateClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => updateClock((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!client) {
      setSession(null);
      return;
    }
    let current = true;
    client.auth.getSession().then(({ data: result, error }) => {
      if (current) {
        setSession(result.session);
        if (error) setError(friendlyError(error));
      }
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, s) => {
      if (!current) return;
      setSession(s);
      if (!s) {
        setData(EMPTY);
        setLoaded(false);
      }
    });
    return () => {
      current = false;
      listener.subscription.unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    if (!client || !session?.user.id) return;
    let received = false;
    setLoading(true);
    setError("");
    const sync = synchronizeCatalog(
      client,
      (d) => {
        received = true;
        setData(d);
        setLoaded(true);
        setLoading(false);
      },
      status => {
        setSyncStatus(status);
        if (status === 'offline') {
          setLoading(false);
          setError('Sin conexión. Los cambios reales requieren acceso a Supabase. Se reintentará al recuperar la red.');
        }
      },
      (e) => {
        setError(friendlyError(e));
        setLoading(false);
        if (!received || /autorizado|denegado/i.test(friendlyError(e))) {
          setData(EMPTY);
          setLoaded(false);
        }
      },
    );
    synchronizer.current = sync;
    return () => {
      sync.stop();
      if (synchronizer.current === sync) synchronizer.current = null;
    };
  }, [client, session?.user.id]);
  useEffect(() => {
    let stopped = false;
    let cleanup: (() => void) | undefined;
    observeNativeLifecycle(() => {
      if (modal || selected) {
        setModal(null);
        setSelected(null);
      } else if (navOpen) setNavOpen(false);
      else setPage("dashboard");
    })
      .then((stop) => {
        if (stopped) stop();
        else cleanup = stop;
      })
      .catch(() => {
        // La app web funciona sin integración nativa.
      });
    return () => {
      stopped = true;
      cleanup?.();
    };
  }, [modal, selected, navOpen]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setPagination(1);
  }, [query, appFilter, statusFilter]);

  const active = data.licenses.filter((l) => statusOf(l) === "activa");
  const expired = data.licenses.filter((l) => statusOf(l) === "expirada");
  const revoked = data.licenses.filter((l) => statusOf(l) === "revocada");
  const soon = active
    .filter(
      (l) =>
        l.fecha_expiracion &&
        Date.parse(l.fecha_expiracion) <= Date.now() + 30 * 86_400_000,
    )
    .sort(
      (a, b) =>
        Date.parse(a.fecha_expiracion!) - Date.parse(b.fecha_expiracion!),
    );
  const filtered = filterLicenses(data, query, appFilter, statusFilter);
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(pagination, pages);
  const picked = data.licenses.find((l) => l.id === selected);

  function navigate(p: Page) {
    setPage(p);
    setNavOpen(false);
    setError("");
  }
  function commitDemo(d: Data) {
    saveDemo(d);
    setData(d);
  }
  async function refresh() {
    if (!client) return;
    setLoading(true);
    setError("");
    try {
      await synchronizer.current?.refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }
  async function perform(
    action: () => Promise<void>,
    message: string,
    closeModal = true,
  ) {
    setBusy(true);
    setError("");
    try {
      await action();
      if (closeModal) setModal(null);
      setToast(message);
      if (client) {
        try {
          await synchronizer.current?.refresh();
        } catch (e) {
          setError(
            `La operación se guardó. No se pudo actualizar la vista: ${friendlyError(e)}`,
          );
        }
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy(key: string) {
    try {
      await copyText(key);
      setToast("Clave copiada al portapapeles");
    } catch {
      setError(
        "No se pudo copiar. Abre el detalle y selecciona la clave para copiarla.",
      );
    }
  }
  const close = useMemo(
    () => () => {
      if (!busy) {
        setModal(null);
        setSelected(null);
        setError("");
      }
    },
    [busy],
  );
  function newLicense() {
    setError("");
    if (!data.applications.length) {
      setModal("app");
      setToast("Primero registra una aplicación");
    } else setModal("license");
  }
  function showLicense(id: string) {
    setError("");
    setSelected(id);
  }
  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      setError(friendlyError(error));
      return;
    }
    setData(EMPTY);
    setSelected(null);
    setLoaded(false);
    setError("");
  }
  function useDemo() {
    saveConnection(null);
    setConfig(null);
    setData(loadDemo());
    setLoaded(true);
    setError("");
    setPage("dashboard");
    setSession(null);
  }
  async function exportCsv() {
    const safe = (s: string) =>
      `"${(/^[\s]*[=+@-]|^[\t\r\n]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
    const rows = [
      [
        "Aplicación",
        "Cliente",
        "Correo",
        "Clave",
        "Estado",
        "Vencimiento",
        "Equipos máximos",
      ],
      ...filtered.map((l) => [
        data.applications.find((a) => a.id === l.app_id)?.nombre || "",
        l.cliente,
        l.email_cliente,
        l.clave,
        STATUS[statusOf(l)],
        l.fecha_expiracion || "Sin vencimiento",
        String(l.max_equipos),
      ]),
    ];
    try {
      await saveCsv(
        "\uFEFF" + rows.map((r) => r.map(safe).join(",")).join("\r\n"),
        `${demo ? "demo-" : ""}licencias.csv`,
      );
      setToast("Catálogo exportado");
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  function licenseTable(items: License[], compact = false) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente / licencia</th>
              <th>Aplicación</th>
              <th>Estado</th>
              <th>Vencimiento</th>
              {!compact && <th>Equipos</th>}
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => {
              const app = data.applications.find((a) => a.id === l.app_id);
              return (
                <tr key={l.id}>
                  <td>
                    <button
                      className="client-button"
                      onClick={() => showLicense(l.id)}
                    >
                      {l.cliente}
                    </button>
                    <span className="key-preview">{l.clave.slice(0, 16)}…</span>
                  </td>
                  <td>
                    <span className="table-app">
                      <AppMark app={app} small />
                      <span>{app?.nombre || "Aplicación"}</span>
                    </span>
                  </td>
                  <td>
                    <Badge license={l} />
                  </td>
                  <td
                    className={statusOf(l) === "expirada" ? "expired-text" : ""}
                  >
                    {dateLabel(l.fecha_expiracion)}
                  </td>
                  {!compact && (
                    <td>
                      <span className="device-count">
                        <Monitor size={14} />
                        {
                          data.activations.filter((a) => a.licencia_id === l.id)
                            .length
                        }
                        <span>/ {l.max_equipos}</span>
                      </span>
                    </td>
                  )}
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={`Copiar clave de ${l.cliente}`}
                        title="Copiar clave"
                        onClick={() => copy(l.clave)}
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Ver licencia de ${l.cliente}`}
                        title="Ver detalle"
                        onClick={() => showLicense(l.id)}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const connectedView = demo || (session && loaded);
  return (
    <div className="shell">
      {navOpen && (
        <button
          className="nav-scrim"
          aria-label="Cerrar navegación"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-icon">
            <ShieldCheck size={24} />
          </span>
          <span>
            licencia<span className="brand-dot">.</span>
            <small>SOFTWARE MANAGER</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">MI</span>
          <div>
            Mi espacio de trabajo<small>Administrador de software</small>
          </div>
          <ShieldCheck size={14} />
        </div>
        <div className="nav-label">PRINCIPAL</div>
        <nav aria-label="Navegación principal">
          {(
            [
              { id: "dashboard", icon: LayoutDashboard },
              { id: "licenses", icon: KeyRound },
              { id: "apps", icon: Boxes },
              { id: "devices", icon: Monitor },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "nav-item selected" : "nav-item"}
              onClick={() => navigate(n.id)}
              aria-current={page === n.id ? "page" : undefined}
            >
              <n.icon size={18} />
              <span>{PAGES[n.id]}</span>
              {n.id === "licenses" && (
                <span className="nav-count">{data.licenses.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label manage-label">ADMINISTRACIÓN</div>
        <button
          className={`nav-item ${page === "settings" ? "selected" : ""}`}
          onClick={() => navigate("settings")}
        >
          <Settings2 size={18} />
          Configuración
        </button>
        <div className="sidebar-bottom">
          <div className="security-card">
            <ShieldCheck size={20} />
            <strong>El control es tuyo</strong>
            <p>Una consola para todas tus aplicaciones y licencias.</p>
            <button
              onClick={() => {
                navigate("settings");
              }}
            >
              Ver configuración <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="profile">
            <div className="profile-avatar">{demo ? "DE" : "AD"}</div>
            <div>
              <strong>
                {demo ? "Cuenta de demostración" : "Administrador"}
              </strong>
              <small>
                {demo
                  ? "Datos de ejemplo"
                  : session?.user.email || "Sin sesión"}
              </small>
            </div>
            {session && (
              <button
                className="icon-button"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                onClick={signOut}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setNavOpen(!navOpen)}
              aria-label="Abrir navegación"
            >
              <Boxes size={20} />
            </button>
            <span className="breadcrumb-root">Espacio de trabajo</span>
            <span className="slash">/</span>
            <strong>{PAGES[page]}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-dot ${demo ? "demo" : syncStatus === "synced" && loaded ? "" : "offline"}`}
            />
            <span>
              {demo
                ? "Modo demostración"
                : loaded
                  ? {
                      connecting: "Conectando…",
                      synced: "Sincronizado",
                      updating: "Sincronizando…",
                      offline: "Sin conexión",
                      error: "Reintentar conexión",
                    }[syncStatus]
                  : "Conectar cuenta"}
            </span>
            <button
              className="icon-button"
              title="Ayuda de configuración"
              aria-label="Ayuda de configuración"
              onClick={() => navigate("settings")}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main>
          {demo && (
            <div className="demo-banner">
              <span>
                <Sparkles size={15} />
                <strong>Explora tu panel.</strong> Estás usando datos de
                demostración guardados en este dispositivo. No se sincronizan.
              </span>
              <button onClick={() => navigate("settings")}>
                Conectar Supabase <ArrowRight size={14} />
              </button>
            </div>
          )}
          {error && !modal && !picked && (
            <div className="alert error" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Cerrar aviso"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!connectedView && page !== "settings" ? (
            <div className="login-stage">
              <div className="page-heading">
                <div className="eyebrow">ACCESO SEGURO</div>
                <h1>Bienvenido a tu panel</h1>
                <p>Inicia sesión con tu cuenta administradora de Supabase.</p>
              </div>
              {loading ? (
                <div className="loading">
                  <Loader2 className="spin" />
                  Conectando con Supabase…
                </div>
              ) : session ? (
                <div className="card login-card">
                  <ShieldX size={30} />
                  <h2>No se pudo abrir el panel</h2>
                  <p>
                    Revisa el aviso y la autorización de tu usuario en Supabase.
                  </p>
                  <div className="button-row">
                    <button className="button primary" onClick={refresh}>
                      Reintentar
                    </button>
                    <button className="button" onClick={signOut}>
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              ) : (
                <LoginForm
                  login={async (email, password) => {
                    if (!client) return;
                    await perform(
                      async () => {
                        const result = await client.auth.signInWithPassword({
                          email,
                          password,
                        });
                        if (result.error) throw result.error;
                      },
                      "Sesión iniciada",
                      false,
                    );
                  }}
                  busy={busy}
                />
              )}
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {page === "dashboard"
                      ? "TU CENTRO DE CONTROL"
                      : "ADMINISTRACIÓN DE SOFTWARE"}
                  </div>
                  <h1>
                    {page === "dashboard"
                      ? "Tu software, bajo control."
                      : PAGES[page]}
                  </h1>
                  <p>
                    {
                      {
                        dashboard:
                          "Una vista clara de tus licencias, aplicaciones y clientes.",
                        licenses:
                          "Genera, consulta y administra el acceso a tu software.",
                        apps: "Todos tus programas, conectados a un mismo panel.",
                        devices:
                          "Consulta y administra los equipos vinculados a tus licencias.",
                        settings:
                          "Conecta tu base de datos y prepara tus aplicaciones.",
                      }[page]
                    }
                  </p>
                </div>
                {connectedView && page !== "settings" && (
                  <div className="heading-actions">
                    {!demo && (
                      <button
                        className="button"
                        disabled={loading}
                        onClick={refresh}
                      >
                        <RefreshCw
                          size={16}
                          className={loading ? "spin" : ""}
                        />
                        Actualizar
                      </button>
                    )}
                    <button
                      className="button primary"
                      onClick={
                        page === "apps" ? () => setModal("app") : newLicense
                      }
                    >
                      <Plus size={17} />
                      {page === "apps" ? "Nueva aplicación" : "Nueva licencia"}
                    </button>
                  </div>
                )}
              </div>

              {page === "dashboard" && (
                <>
                  <div className="metrics">
                    {[
                      {
                        label: "Total de licencias",
                        value: data.licenses.length,
                        note: `${data.applications.length} aplicaciones registradas`,
                        icon: KeyRound,
                        color: "indigo",
                      },
                      {
                        label: "Licencias activas",
                        value: active.length,
                        note: "Acceso vigente a tu software",
                        icon: ShieldCheck,
                        color: "green",
                      },
                      {
                        label: "Licencias expiradas",
                        value: expired.length,
                        note: "Pendientes de renovación",
                        icon: Clock3,
                        color: "amber",
                      },
                      {
                        label: "Equipos vinculados",
                        value: data.activations.length,
                        note: `${revoked.length} licencias revocadas`,
                        icon: Monitor,
                        color: "blue",
                      },
                    ].map((m) => (
                      <div className="metric card" key={m.label}>
                        <div className="metric-top">
                          <span>{m.label}</span>
                          <span className={`metric-icon ${m.color}`}>
                            <m.icon size={18} />
                          </span>
                        </div>
                        <strong>{m.value.toLocaleString("es-PE")}</strong>
                        <small>
                          <span className={`mini-dot ${m.color}`} />
                          {m.note}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <section className="card app-overview">
                      <div className="section-head">
                        <div>
                          <h2>Licencias por aplicación</h2>
                          <p>Distribución de tu catálogo de software</p>
                        </div>
                        <span className="subtle-tag">
                          {data.applications.length} aplicaciones
                        </span>
                      </div>
                      {data.applications.length ? (
                        <div className="app-bars">
                          {data.applications.slice(0, 4).map((a) => {
                            const total = data.licenses.filter(
                              (l) => l.app_id === a.id,
                            ).length;
                            const valid = active.filter(
                              (l) => l.app_id === a.id,
                            ).length;
                            return (
                              <button
                                className="app-bar-row"
                                key={a.id}
                                onClick={() => {
                                  setAppFilter(a.id);
                                  setStatusFilter("all");
                                  setQuery("");
                                  navigate("licenses");
                                }}
                              >
                                <AppMark app={a} />
                                <div className="app-bar-content">
                                  <div>
                                    <strong>{a.nombre}</strong>
                                    <span>
                                      {total} <small>licencias</small>
                                    </span>
                                  </div>
                                  <div className="bar-track">
                                    <span
                                      style={{
                                        width: `${data.licenses.length ? (total / data.licenses.length) * 100 : 0}%`,
                                        background: a.color,
                                      }}
                                    />
                                  </div>
                                  <small>{valid} activas</small>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <Empty title="Tu primera aplicación">
                          Registra un programa para comenzar a emitir licencias.
                        </Empty>
                      )}
                      <div className="section-footer">
                        <span>
                          <i className="legend-dot" />
                          Total de licencias registradas
                        </span>
                        <button
                          className="text-button"
                          onClick={() => navigate("apps")}
                        >
                          Ver aplicaciones <ArrowRight size={14} />
                        </button>
                      </div>
                    </section>
                    <section className="card expiration-card">
                      <div className="section-head">
                        <div>
                          <h2>Próximos vencimientos</h2>
                          <p>En los próximos 30 días</p>
                        </div>
                        <span className="count-pill">{soon.length}</span>
                      </div>
                      {soon.length ? (
                        <div className="expiry-list">
                          {soon.slice(0, 3).map((l) => (
                            <button
                              key={l.id}
                              onClick={() => showLicense(l.id)}
                            >
                              <span className="expiry-icon">
                                <Clock3 size={18} />
                              </span>
                              <span>
                                <strong>{l.cliente}</strong>
                                <small>
                                  {
                                    data.applications.find(
                                      (a) => a.id === l.app_id,
                                    )?.nombre
                                  }
                                </small>
                              </span>
                              <span className="expiry-days">
                                {Math.max(
                                  1,
                                  Math.ceil(
                                    (Date.parse(l.fecha_expiracion!) -
                                      Date.now()) /
                                      86_400_000,
                                  ),
                                )}{" "}
                                días
                                <small>{dateLabel(l.fecha_expiracion)}</small>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="all-clear">
                          <CheckCircle2 size={28} />
                          <strong>Todo al día</strong>
                          <p>
                            No hay licencias por vencer en los próximos 30 días.
                          </p>
                        </div>
                      )}
                      <div className="renew-note">
                        <ShieldCheck size={16} />
                        <span>
                          Renueva a tiempo para mantener el acceso de tus
                          clientes.
                        </span>
                      </div>
                    </section>
                  </div>
                  <section className="card recent">
                    <div className="section-head">
                      <div>
                        <h2>Licencias recientes</h2>
                        <p>Los últimos accesos que has emitido</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setAppFilter("all");
                          setStatusFilter("all");
                          setQuery("");
                          navigate("licenses");
                        }}
                      >
                        Ver todas <ArrowRight size={15} />
                      </button>
                    </div>
                    {data.licenses.length ? (
                      licenseTable(data.licenses.slice(0, 5), true)
                    ) : (
                      <Empty
                        title="Comienza con tu primera licencia"
                        action={
                          <button
                            className="button primary"
                            onClick={newLicense}
                          >
                            <Plus size={16} />
                            Nueva licencia
                          </button>
                        }
                      >
                        Asigna una aplicación y un cliente. El panel se encarga
                        de la clave.
                      </Empty>
                    )}
                  </section>
                </>
              )}

              {page === "licenses" && (
                <section className="card catalog">
                  <div className="catalog-toolbar">
                    <div className="search-field">
                      <Search size={17} />
                      <input
                        aria-label="Buscar licencias"
                        placeholder="Buscar cliente, clave o aplicación…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Filtrar por aplicación"
                      value={appFilter}
                      onChange={(e) => setAppFilter(e.target.value)}
                    >
                      <option value="all">Todas las aplicaciones</option>
                      {data.applications.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filtrar por estado"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">Todos los estados</option>
                      {Object.entries(STATUS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button export-button"
                      disabled={!filtered.length}
                      onClick={exportCsv}
                    >
                      <ArrowDownToLine size={16} />
                      Exportar
                    </button>
                  </div>
                  {filtered.length ? (
                    licenseTable(
                      filtered.slice((currentPage - 1) * 8, currentPage * 8),
                    )
                  ) : (
                    <Empty
                      title={
                        data.licenses.length
                          ? "No encontramos coincidencias"
                          : "Aún no hay licencias"
                      }
                    >
                      {data.licenses.length
                        ? "Prueba con otro cliente o cambia los filtros."
                        : "Crea una licencia para comenzar a gestionar tus ventas."}
                    </Empty>
                  )}
                  <div className="pagination">
                    <span>
                      {filtered.length
                        ? `${(currentPage - 1) * 8 + 1}–${Math.min(currentPage * 8, filtered.length)} de ${filtered.length} licencias`
                        : "0 licencias"}
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        disabled={currentPage === 1}
                        onClick={() => setPagination(currentPage - 1)}
                        aria-label="Página anterior"
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <span>
                        {currentPage} / {pages}
                      </span>
                      <button
                        className="icon-button"
                        disabled={currentPage >= pages}
                        onClick={() => setPagination(currentPage + 1)}
                        aria-label="Página siguiente"
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {page === "apps" && (
                <div className="applications-grid">
                  {data.applications.map((a) => (
                    <section className="card application-card" key={a.id}>
                      <div className="application-top">
                        <AppMark app={a} />
                        <span className="subtle-tag">{a.prefijo}</span>
                      </div>
                      <h2>{a.nombre}</h2>
                      <code>{a.codigo_app}</code>
                      <p>{a.descripcion || "Sin descripción"}</p>
                      <div className="app-stats">
                        <div>
                          <strong>
                            {
                              data.licenses.filter((l) => l.app_id === a.id)
                                .length
                            }
                          </strong>
                          <small>Licencias</small>
                        </div>
                        <div>
                          <strong>
                            {active.filter((l) => l.app_id === a.id).length}
                          </strong>
                          <small>Activas</small>
                        </div>
                      </div>
                      <button
                        className="button full"
                        onClick={() => {
                          setAppFilter(a.id);
                          setStatusFilter("all");
                          setQuery("");
                          navigate("licenses");
                        }}
                      >
                        Ver licencias <ArrowRight size={15} />
                      </button>
                    </section>
                  ))}
                  <button
                    className="new-app-card"
                    onClick={() => setModal("app")}
                  >
                    <span>
                      <Plus size={23} />
                    </span>
                    <strong>Añadir aplicación</strong>
                    <small>Conecta tu próximo programa</small>
                  </button>
                </div>
              )}

              {page === "devices" && (
                <section className="card">
                  <div className="section-head">
                    <div>
                      <h2>Equipos autorizados</h2>
                      <p>
                        La primera validación registra el equipo de tu cliente.
                      </p>
                    </div>
                    <button
                      className="button"
                      onClick={() => {
                        setError("");
                        setModal("validate");
                      }}
                    >
                      <Activity size={16} />
                      Probar validación
                    </button>
                  </div>
                  {data.activations.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Identificador del equipo</th>
                            <th>Cliente</th>
                            <th>Aplicación</th>
                            <th>Última validación</th>
                            <th>Estado de licencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.activations.map((a) => {
                            const l = data.licenses.find(
                              (l) => l.id === a.licencia_id,
                            );
                            return (
                              <tr key={a.id}>
                                <td>
                                  <span className="hardware">
                                    <Monitor size={16} />
                                    <code title={a.hardware_id}>
                                      {a.hardware_id}
                                    </code>
                                  </span>
                                </td>
                                <td>
                                  <button
                                    className="client-button"
                                    onClick={() => l && showLicense(l.id)}
                                  >
                                    {l?.cliente || "Cliente"}
                                  </button>
                                </td>
                                <td>
                                  {
                                    data.applications.find(
                                      (app) => app.id === l?.app_id,
                                    )?.nombre
                                  }
                                </td>
                                <td>{dateLabel(a.ultimo_acceso)}</td>
                                <td>{l && <Badge license={l} />}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty title="Todavía no hay equipos vinculados">
                      Aparecerán aquí cuando tus programas validen sus primeras
                      licencias.
                    </Empty>
                  )}
                </section>
              )}

              {page === "settings" && (
                <div className="settings-grid">
                  <div className="card settings-card">
                    <div className="settings-icon">
                      <Link2 size={23} />
                    </div>
                    <h2>
                      {demo
                        ? "Conecta tu proyecto de Supabase"
                        : "Conexión a Supabase"}
                    </h2>
                    <p>
                      Tu catálogo se guarda en tu propia base de datos. La clave
                      pública permite la conexión; tu cuenta administradora
                      controla el acceso.
                    </p>
                    <ConnectionForm
                      config={config}
                      busy={busy}
                      onConnect={async (c) => {
                        setBusy(true);
                        setError("");
                        try {
                          checkAndSave(c);
                        } catch (e) {
                          setError(friendlyError(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    {!demo && (
                      <div className="connection-actions">
                        <button className="text-button" onClick={useDemo}>
                          Volver a la demostración
                        </button>
                        {session && (
                          <button className="text-button" onClick={signOut}>
                            <LogOut size={15} />
                            Cerrar sesión
                          </button>
                        )}
                      </div>
                    )}
                    {!demo && !session && (
                      <div className="settings-login">
                        <h3>Acceso de administrador</h3>
                        <LoginForm
                          busy={busy}
                          login={async (email, password) => {
                            if (client)
                              await perform(
                                async () => {
                                  const { error } =
                                    await client.auth.signInWithPassword({
                                      email,
                                      password,
                                    });
                                  if (error) throw error;
                                  setPage("dashboard");
                                },
                                "Sesión iniciada",
                                false,
                              );
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="settings-side">
                    <section className="card settings-card">
                      <h2>Empieza en tres pasos</h2>
                      <ol className="setup-steps">
                        <li>
                          <span>1</span>
                          <div>
                            <strong>Prepara tu base de datos</strong>
                            <p>
                              Ejecuta el archivo schema.sql incluido en el
                              proyecto, desde SQL Editor de Supabase.
                            </p>
                          </div>
                        </li>
                        <li>
                          <span>2</span>
                          <div>
                            <strong>Crea tu administrador</strong>
                            <p>
                              Añade un usuario en Authentication y autorízalo
                              con la instrucción al final del archivo SQL.
                            </p>
                          </div>
                        </li>
                        <li>
                          <span>3</span>
                          <div>
                            <strong>Conecta e inicia sesión</strong>
                            <p>
                              Introduce la URL y la clave pública. Después
                              accede con tu correo y contraseña.
                            </p>
                          </div>
                        </li>
                      </ol>
                      <a
                        className="text-button"
                        href="https://supabase.com/dashboard"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir Supabase <ExternalLink size={14} />
                      </a>
                    </section>
                    <section className="card settings-card integration-card">
                      <Fingerprint size={23} />
                      <h2>Una identidad por programa</h2>
                      <p>
                        Usa el código de aplicación al validar una licencia.
                        Cada programa consulta su propio catálogo y comparte el
                        mismo sistema de control.
                      </p>
                      <p>
                        ¿Ya tienes un generador? Importa sus claves desde «Nueva
                        licencia». El generador debe permanecer bajo tu control.
                      </p>
                      {connectedView && (
                        <button
                          className="button full"
                          onClick={() => {
                            setError("");
                            setModal("validate");
                          }}
                        >
                          <Activity size={16} />
                          Probar validación de licencia
                        </button>
                      )}
                    </section>
                  </div>
                </div>
              )}
            </>
          )}
          <footer className="main-footer">
            <span>
              <ShieldCheck size={13} />
              Panel Administrador de Licencias de Software
            </span>
            <span>
              v1.1 ·{" "}
              {demo
                ? "Demostración local"
                : "Windows + Android · Sincronización automática"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Cerrar notificación"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "app" && (
        <Modal
          title="Nueva aplicación"
          subtitle="Registra un programa sin modificar el código del panel."
          close={close}
        >
          <AppForm
            busy={busy}
            error={error}
            onSubmit={(input) =>
              perform(async () => {
                if (client) await api.addApp(client, input);
                else commitDemo(addDemoApp(data, input));
              }, "Aplicación registrada")
            }
            cancel={close}
          />
        </Modal>
      )}
      {modal === "license" && (
        <Modal
          title="Nueva licencia"
          subtitle="Asigna acceso a tu software en unos segundos."
          close={close}
        >
          <LicenseForm
            applications={data.applications}
            busy={busy}
            error={error}
            initialApp={appFilter}
            onSubmit={(input) =>
              perform(async () => {
                if (client) await api.addLicense(client, input);
                else commitDemo(addDemoLicense(data, input));
              }, "Licencia creada. Ya puedes copiarla desde el catálogo.")
            }
            cancel={close}
          />
        </Modal>
      )}
      {picked && !modal && (
        <Modal
          title="Detalle de licencia"
          subtitle={
            data.applications.find((a) => a.id === picked.app_id)?.nombre || ""
          }
          close={close}
          wide
        >
          <div className="detail-content">
            <div className="detail-title">
              <div>
                <h3>{picked.cliente}</h3>
                <p>{picked.email_cliente || "Sin correo registrado"}</p>
              </div>
              <Badge license={picked} />
            </div>
            <label className="field">
              Clave de licencia
              <div className="copy-key">
                <input
                  readOnly
                  value={picked.clave}
                  aria-label="Clave de licencia"
                />
                <button
                  className="icon-button"
                  onClick={() => copy(picked.clave)}
                  aria-label="Copiar clave completa"
                >
                  <Copy size={18} />
                </button>
              </div>
            </label>
            <div className="detail-facts">
              <div>
                <small>Vencimiento</small>
                <strong>{dateLabel(picked.fecha_expiracion)}</strong>
              </div>
              <div>
                <small>Equipos permitidos</small>
                <strong>{picked.max_equipos}</strong>
              </div>
              <div>
                <small>Fecha de emisión</small>
                <strong>{dateLabel(picked.created_at)}</strong>
              </div>
            </div>
            <h3 className="detail-section-title">Equipos vinculados</h3>
            {data.activations
              .filter((a) => a.licencia_id === picked.id)
              .map((a) => (
                <div className="activation-detail" key={a.id}>
                  <Monitor size={18} />
                  <div>
                    <code>{a.hardware_id}</code>
                    <small>
                      Última validación: {dateLabel(a.ultimo_acceso)}
                    </small>
                  </div>
                  <button
                    className="button small-button"
                    disabled={busy}
                    onClick={() =>
                      perform(
                        async () => {
                          if (client) await api.release(client, a.id);
                          else
                            commitDemo({
                              ...data,
                              activations: data.activations.filter(
                                (x) => x.id !== a.id,
                              ),
                            });
                        },
                        "Equipo desvinculado. El cupo quedó disponible.",
                        false,
                      )
                    }
                  >
                    Liberar
                  </button>
                </div>
              ))}
            {!data.activations.some((a) => a.licencia_id === picked.id) && (
              <p className="muted">
                Esta licencia aún no tiene equipos vinculados.
              </p>
            )}
            <p className="fine-print">
              Liberar un equipo deja un cupo disponible. Ese equipo podrá
              registrarse de nuevo si conserva la clave y hay un cupo libre.
            </p>
            <div className="detail-renew">
              <h3>Renovar vigencia</h3>
              <RenewForm
                busy={busy}
                onSubmit={(date) =>
                  perform(
                    async () => {
                      if (client) await api.renew(client, picked.id, date);
                      else
                        commitDemo({
                          ...data,
                          licenses: data.licenses.map((l) =>
                            l.id === picked.id
                              ? { ...l, fecha_expiracion: date }
                              : l,
                          ),
                        });
                    },
                    "Vigencia actualizada",
                    false,
                  )
                }
              />
            </div>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <div className="detail-bottom">
              <p>
                {picked.estado === "activa"
                  ? "La revocación bloquea las siguientes validaciones."
                  : "Restaurar conserva la fecha de vencimiento actual."}
              </p>
              <button
                className={`button ${picked.estado === "activa" ? "danger" : "primary"}`}
                disabled={busy}
                onClick={() =>
                  perform(
                    async () => {
                      const estado =
                        picked.estado === "activa" ? "revocada" : "activa";
                      if (client)
                        await api.changeStatus(client, picked.id, estado);
                      else
                        commitDemo({
                          ...data,
                          licenses: data.licenses.map((l) =>
                            l.id === picked.id ? { ...l, estado } : l,
                          ),
                        });
                    },
                    picked.estado === "activa"
                      ? "Licencia revocada"
                      : "Licencia restaurada",
                    false,
                  )
                }
              >
                {picked.estado === "activa" ? (
                  <ShieldX size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
                {picked.estado === "activa"
                  ? "Revocar licencia"
                  : "Restaurar licencia"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {modal === "validate" && (
        <Modal
          title="Probar validación"
          subtitle="Esta prueba registra un equipo si la licencia es válida y tiene cupo."
          close={close}
        >
          <ValidationForm
            data={data}
            demo={demo}
            busy={busy}
            validate={async (code, key, hw) => {
              setBusy(true);
              try {
                if (client) {
                  const result = await api.validate(client, code, key, hw);
                  try {
                    await synchronizer.current?.refresh();
                  } catch (e) {
                    setError(
                      `Validación recibida. No se pudo actualizar la vista: ${friendlyError(e)}`,
                    );
                  }
                  return result;
                }
                const { data: next, result } = validateDemo(
                  data,
                  code,
                  key,
                  hw,
                );
                commitDemo(next);
                return result;
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      )}
    </div>
  );

  function checkAndSave(c: Connection) {
    checkConnection(c);
    saveConnection(c);
    setData(EMPTY);
    setLoaded(false);
    setSession(null);
    setConfig(c);
    setToast(
      "Conexión configurada. Inicia sesión con tu cuenta administradora.",
    );
  }
}

function LoginForm({
  login,
  busy,
}: {
  login: (email: string, password: string) => Promise<void>;
  busy: boolean;
}) {
  return (
    <form
      className="form login-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void login(String(f.get("email")), String(f.get("password")));
      }}
    >
      <label className="field">
        Correo electrónico
        <input
          type="email"
          name="email"
          autoComplete="username"
          placeholder="tu@empresa.com"
          required
        />
      </label>
      <label className="field">
        Contraseña
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Tu contraseña de administrador"
          required
        />
      </label>
      <button className="button primary full" disabled={busy}>
        {busy ? (
          <Loader2 size={16} className="spin" />
        ) : (
          <ShieldCheck size={17} />
        )}
        Entrar al panel
      </button>
    </form>
  );
}
function ConnectionForm({
  config,
  busy,
  onConnect,
}: {
  config: Connection | null;
  busy: boolean;
  onConnect: (c: Connection) => Promise<void>;
}) {
  return (
    <form
      className="form connection-form"
      key={config?.url || "new"}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onConnect({
          url: String(f.get("url")).trim().replace(/\/$/, ""),
          key: String(f.get("key")).trim(),
        });
      }}
    >
      <label className="field">
        URL del proyecto
        <input
          type="url"
          name="url"
          required
          placeholder="https://tu-proyecto.supabase.co"
          defaultValue={config?.url}
          autoComplete="off"
        />
      </label>
      <label className="field">
        Clave pública (publishable o anon)
        <input
          name="key"
          required
          type="password"
          placeholder="sb_publishable_… o eyJ…"
          defaultValue={config?.key}
          autoComplete="off"
        />
        <small>
          Encuéntrala en Project Settings → API Keys. Nunca introduzcas la clave
          service_role.
        </small>
      </label>
      <button className="button primary" disabled={busy}>
        <Link2 size={16} />
        {config ? "Guardar conexión" : "Conectar mi proyecto"}
      </button>
    </form>
  );
}
function AppForm({
  onSubmit,
  busy,
  error,
  cancel,
}: {
  onSubmit: (a: AppInput) => Promise<void>;
  busy: boolean;
  error: string;
  cancel: () => void;
}) {
  const [color, setColor] = useState(COLORS[0]);
  return (
    <form
      className="form modal-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSubmit({
          nombre: String(f.get("nombre")).trim(),
          codigo_app: String(f.get("code")).trim().toLowerCase(),
          prefijo: String(f.get("prefix")).trim().toUpperCase(),
          color,
          descripcion: String(f.get("description")).trim(),
        });
      }}
    >
      <label className="field">
        Nombre del programa
        <input
          name="nombre"
          required
          maxLength={120}
          placeholder="Ej. Punto de Venta"
        />
      </label>
      <div className="form-grid">
        <label className="field">
          Código de aplicación
          <input
            name="code"
            required
            pattern="[a-z0-9][a-z0-9_-]{1,49}"
            maxLength={50}
            placeholder="punto-venta"
          />
          <small>Único. Minúsculas, números y guiones.</small>
        </label>
        <label className="field">
          Prefijo de las claves
          <input
            name="prefix"
            required
            pattern="[A-Za-z0-9]{2,10}"
            maxLength={10}
            placeholder="POS"
            className="uppercase"
          />
          <small>Entre 2 y 10 letras o números.</small>
        </label>
      </div>
      <label className="field">
        Descripción <span className="optional">(opcional)</span>
        <textarea
          name="description"
          maxLength={500}
          rows={2}
          placeholder="¿Qué hace este programa?"
        />
      </label>
      <fieldset className="color-picker">
        <legend>Color de la aplicación</legend>
        {COLORS.map((c) => (
          <button
            key={c}
            className={color === c ? "chosen" : ""}
            style={{ background: c }}
            type="button"
            onClick={() => setColor(c)}
            aria-pressed={color === c}
            aria-label={`Color ${c}`}
          >
            {color === c && <Check size={16} />}
          </button>
        ))}
      </fieldset>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-footer">
        <button
          className="button"
          type="button"
          onClick={cancel}
          disabled={busy}
        >
          Cancelar
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
          Registrar aplicación
        </button>
      </div>
    </form>
  );
}
function LicenseForm({
  applications,
  onSubmit,
  busy,
  error,
  cancel,
  initialApp,
}: {
  applications: Application[];
  onSubmit: (l: LicenseInput) => Promise<void>;
  busy: boolean;
  error: string;
  cancel: () => void;
  initialApp: string;
}) {
  const [mode, setMode] = useState("generate");
  return (
    <form
      className="form modal-form"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSubmit({
          app_id: String(f.get("app")),
          cliente: String(f.get("client")).trim(),
          email_cliente: String(f.get("email")).trim(),
          fecha_expiracion: expiryFromDays(Number(f.get("days"))),
          max_equipos: Number(f.get("devices")),
          clave:
            mode === "import"
              ? String(f.get("key")).trim().toUpperCase()
              : undefined,
        });
      }}
    >
      <label className="field">
        Aplicación
        <select
          name="app"
          defaultValue={initialApp !== "all" ? initialApp : applications[0]?.id}
          required
        >
          {applications.map((a) => (
            <option value={a.id} key={a.id}>
              {a.nombre} · {a.prefijo}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nombre del cliente
        <input
          name="client"
          required
          maxLength={160}
          placeholder="Ej. Comercial San Martín"
        />
      </label>
      <label className="field">
        Correo del cliente <span className="optional">(opcional)</span>
        <input
          name="email"
          type="email"
          maxLength={254}
          placeholder="cliente@empresa.com"
        />
      </label>
      <div className="form-grid">
        <label className="field">
          Vigencia
          <select name="days" defaultValue="365">
            <option value="30">30 días</option>
            <option value="90">90 días</option>
            <option value="180">180 días</option>
            <option value="365">1 año (365 días)</option>
            <option value="0">Sin vencimiento</option>
          </select>
        </label>
        <label className="field">
          Máximo de equipos
          <input
            name="devices"
            type="number"
            min="1"
            max="100"
            defaultValue="1"
            required
          />
        </label>
      </div>
      <div className="segmented" role="group" aria-label="Origen de la clave">
        <button
          type="button"
          aria-pressed={mode === "generate"}
          className={mode === "generate" ? "selected" : ""}
          onClick={() => setMode("generate")}
        >
          <Sparkles size={15} />
          Generar clave
        </button>
        <button
          type="button"
          aria-pressed={mode === "import"}
          className={mode === "import" ? "selected" : ""}
          onClick={() => setMode("import")}
        >
          <ArrowDownToLine size={15} />
          Importar clave
        </button>
      </div>
      {mode === "generate" ? (
        <div className="info-box">
          <ShieldCheck size={20} />
          <p>
            Se generará una clave aleatoria de 128 bits con el prefijo de la
            aplicación.
          </p>
        </div>
      ) : (
        <label className="field">
          Clave de tu generador
          <input
            name="key"
            className="uppercase monospace"
            pattern="[A-Za-z0-9-]{16,200}"
            minLength={16}
            maxLength={200}
            required
            placeholder="POS-TU-CLAVE-GENERADA"
          />
          <small>
            Entre 16 y 200 caracteres: letras, números y guiones. Usa claves
            impredecibles.
          </small>
        </label>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-footer">
        <button
          className="button"
          type="button"
          onClick={cancel}
          disabled={busy}
        >
          Cancelar
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <KeyRound size={16} />
          )}
          {mode === "generate" ? "Crear licencia" : "Registrar licencia"}
        </button>
      </div>
    </form>
  );
}
function RenewForm({
  onSubmit,
  busy,
}: {
  onSubmit: (date: string | null) => Promise<void>;
  busy: boolean;
}) {
  return (
    <form
      className="renew-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(
          expiryFromDays(Number(new FormData(e.currentTarget).get("days"))),
        );
      }}
    >
      <select name="days" aria-label="Nueva vigencia">
        <option value="30">30 días desde hoy</option>
        <option value="90">90 días desde hoy</option>
        <option value="365">1 año desde hoy</option>
        <option value="0">Sin vencimiento</option>
      </select>
      <button className="button" disabled={busy}>
        <RefreshCw size={15} />
        Renovar
      </button>
    </form>
  );
}
function ValidationForm({
  data,
  demo,
  busy,
  validate,
}: {
  data: Data;
  demo: boolean;
  busy: boolean;
  validate: (
    code: string,
    key: string,
    hw: string,
  ) => Promise<ValidationResult>;
}) {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState("");
  return (
    <form
      className="form modal-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setResult(null);
        const f = new FormData(e.currentTarget);
        try {
          setResult(
            await validate(
              String(f.get("app")),
              String(f.get("key")).trim(),
              String(f.get("hw")).trim(),
            ),
          );
        } catch (e) {
          setError(friendlyError(e));
        }
      }}
    >
      <label className="field">
        Aplicación
        <select name="app" required>
          {data.applications.map((a) => (
            <option key={a.id} value={a.codigo_app}>
              {a.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Clave de licencia
        <input
          name="key"
          className="monospace"
          required
          maxLength={200}
          placeholder="Pega la clave completa"
        />
      </label>
      <label className="field">
        Identificador estable del equipo
        <input
          name="hw"
          required
          minLength={16}
          maxLength={256}
          defaultValue={demo ? "equipo-prueba-00000001" : ""}
          placeholder="Identificador o huella del dispositivo"
        />
        <small>
          Esta prueba consume un cupo de activación si el equipo es nuevo.
        </small>
      </label>
      {result && (
        <div
          className={`alert ${result.valida ? "success" : "error"} validation-result`}
          role="status"
        >
          <strong>{result.codigo}</strong>
          {result.mensaje}
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <button
        className="button primary full"
        disabled={busy || !data.applications.length}
      >
        {busy ? <Loader2 size={16} className="spin" /> : <Activity size={16} />}
        Validar y autorizar equipo
      </button>
    </form>
  );
}
