"use client";
import { useCallback, useEffect, useId, useRef, useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Car,
  Home,
  Search,
  Plus,
  Route,
  Users,
  Building2,
  MessageCircle,
  Bell,
  UserRound,
  ShieldCheck,
  LogOut,
  ArrowRight,
  CalendarDays,
  Star,
  Wallet,
  Menu,
  AlertTriangle,
  ChevronRight,
  Repeat,
  HeartHandshake,
} from "lucide-react";
import { copy, places } from "@/lib/strings";
import { karachiTime } from "@/lib/rules";
import type { Point } from "@/lib/rules";
const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => <div className="loading">Loading map…</div>,
});
const icons = [
  Home,
  Search,
  Plus,
  Route,
  Repeat,
  Building2,
  MessageCircle,
  Bell,
  UserRound,
  ShieldCheck,
];
const pref = (v: string) =>
  copy.preference[v as keyof typeof copy.preference] || v;
const price = (v: number) => `PKR ${new Intl.NumberFormat("en-PK").format(v)}`;
async function api(path: string, body?: unknown) {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || "Request failed.");
  return data;
}
function Avatar({ user, big = false }: { user: any; big?: boolean }) {
  return user?.image ? (
    <Image
      unoptimized
      width={big ? 70 : 42}
      height={big ? 70 : 42}
      className={`avatar ${big ? "big" : ""}`}
      src={user.image}
      alt={`${user.name} profile`}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className={`avatar ${big ? "big" : ""}`}>
      {user?.name
        ?.split(" ")
        .map((n: string) => n[0])
        .slice(0, 2)
        .join("") || "SR"}
    </span>
  );
}
function Badges({ user }: { user: any }) {
  return (
    <div className="row" style={{ gap: 5 }}>
      {user?.verifications
        ?.filter(
          (v: any) =>
            v.status === "APPROVED" &&
            ["PHONE", "IDENTITY", "UNIVERSITY", "WORKPLACE"].includes(v.kind),
        )
        .map((v: any) => (
          <span className="badge" key={v.kind}>
            <ShieldCheck size={11} />
            {v.kind === "PHONE"
              ? "Phone verified"
              : `${v.kind[0] + v.kind.slice(1).toLowerCase()} reviewed`}
          </span>
        ))}
    </div>
  );
}
function Rating({ user }: { user: any }) {
  const reviews = user?.reviewsReceived || [];
  return (
    <small className="muted">
      {reviews.length ? (
        <>
          <Star size={12} style={{ display: "inline", color: "#b57511" }} />{" "}
          {(
            reviews.reduce((s: number, r: any) => s + r.rating, 0) /
            reviews.length
          ).toFixed(1)}{" "}
          ({reviews.length} reviews)
        </>
      ) : (
        "New user"
      )}
    </small>
  );
}
function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required = false,
  children,
  min,
  max,
  step,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: any;
  required?: boolean;
  children?: React.ReactNode;
  min?: any;
  max?: any;
  step?: any;
  help?: string;
}) {
  const id = useId();
  const descriptionId = help ? `${id}-help` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ? (
        <select
          id={id}
          aria-describedby={descriptionId}
          name={name}
          defaultValue={defaultValue}
          required={required}
        >
          {children}
        </select>
      ) : type === "textarea" ? (
        <textarea
          id={id}
          aria-describedby={descriptionId}
          name={name}
          defaultValue={defaultValue}
          required={required}
        />
      ) : (
        <input
          id={id}
          aria-describedby={descriptionId}
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          min={min}
          max={max}
          step={step}
        />
      )}{" "}
      {help && (
        <small id={descriptionId} className="muted" style={{ fontWeight: 400 }}>
          {help}
        </small>
      )}
    </div>
  );
}
function Preference({ value = "MIXED" }: { value?: string }) {
  return (
    <Field name="preference" label="Ride preference" defaultValue={value}>
      {Object.entries(copy.preference).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </Field>
  );
}
function Form({
  onSubmit,
  children,
  label = "Save",
  className = "stack",
}: {
  onSubmit: (
    data: Record<string, any>,
    form: HTMLFormElement,
  ) => Promise<unknown>;
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setError("");
        setBusy(true);
        try {
          await onSubmit(Object.fromEntries(new FormData(form)), form);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Working…" : label}
      </button>
    </form>
  );
}
function Action({
  onClick,
  children,
  danger = false,
  secondary = false,
  confirm,
}: {
  onClick: () => Promise<unknown> | void;
  children: React.ReactNode;
  danger?: boolean;
  secondary?: boolean;
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span>
      <button
        type="button"
        className={`button ${danger ? "danger" : secondary ? "secondary" : ""}`}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError("");
          try {
            await onClick();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {error && (
        <span
          role="alert"
          className="notice error"
          style={{ display: "block", marginTop: 8 }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
function Title({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head row between">
      <div>
        <h1>{title}</h1>
        {text && <p className="muted">{text}</p>}
      </div>
      {action}
    </div>
  );
}
function RideCard({ ride }: { ride: any }) {
  return (
    <article className="card">
      <div className="row between">
        <div className="row">
          <Avatar user={ride.driver} />
          <div>
            <strong>{ride.driver.name}</strong>
            <div>
              <Rating user={ride.driver} />
            </div>
          </div>
        </div>
        <span className="badge neutral">{pref(ride.preference)}</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <Badges user={ride.driver} />
      </div>
      <div className="route">
        <div>
          <strong>{ride.pickup}</strong>
          <small>Pickup · {karachiTime(ride.departure)}</small>
        </div>
        <div>
          <strong>{ride.destination}</strong>
          <small>Destination</small>
        </div>
      </div>
      <div className="row muted" style={{ fontSize: 12 }}>
        <Car size={15} />
        {ride.vehicle.make} {ride.vehicle.model} · {ride.vehicle.colour}
        <span>
          ·{" "}
          {ride.available ??
            ride.capacity -
              ride.bookings
                ?.filter((b: any) =>
                  ["ACCEPTED", "COMPLETED"].includes(b.status),
                )
                .reduce((n: number, b: any) => n + b.seats, 0)}{" "}
          seats
        </span>
      </div>
      {ride.match && (
        <div className="notice" style={{ marginTop: 14, fontSize: 12 }}>
          Pickup approximately {ride.match.pickupMetres} m from route. Drop-off
          approximately {ride.match.dropoffMetres} m from route.
          <br />
          Leaves {Math.abs(ride.match.minutes)} minutes{" "}
          {ride.match.minutes < 0 ? "before" : "after"} your preferred time.
          {ride.community && (
            <>
              <br />
              Same {ride.community.type.toLowerCase()} community.
            </>
          )}
          <br />
          {ride.routeApproximate
            ? "Approximate geographic route."
            : "Road geometry from configured provider."}
        </div>
      )}
      <div className="row between ride-footer">
        <div>
          <span className="price">{price(ride.price)}</span>
          <small className="muted"> / seat</small>
        </div>
        <Link className="button secondary" href={`/rides/${ride.id}`}>
          View ride <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}
function useData(path: string | null, revision = 0, poll = false) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!path) return;
    let live = true;
    setError("");
    const get = () =>
      api(path)
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    get();
    const interval = poll ? setInterval(get, 7000) : null;
    return () => {
      live = false;
      if (interval) clearInterval(interval);
    };
  }, [path, revision, poll]);
  return { data, error };
}
function LoadError({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="notice error">
      {error}
    </div>
  ) : null;
}
function LocationPicker({
  points,
  setPoints,
}: {
  points: Point[];
  setPoints: (v: Point[]) => void;
}) {
  const [target, setTarget] = useState(0);
  return (
    <div className="stack">
      <div className="form-grid">
        {["Pickup", "Destination"].map((label, i) => (
          <div key={label} className="stack" style={{ gap: 8 }}>
            <label className="field">
              {label} location
              <select
                name={i === 0 ? "pickup" : "destination"}
                defaultValue={places[i === 0 ? 0 : 4].name}
                onChange={(e) => {
                  const p = places.find((p) => p.name === e.target.value);
                  if (p)
                    setPoints(
                      points.map((pt, k) =>
                        k === i ? { lat: p.lat, lng: p.lng } : pt,
                      ),
                    );
                }}
              >
                <option value="Custom map location">Custom map location</option>
                {places.map((p) => (
                  <option key={p.name}>{p.name}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label className="field">
                Latitude
                <input
                  type="number"
                  step="any"
                  required
                  min={-90}
                  max={90}
                  value={points[i].lat}
                  onChange={(e) =>
                    setPoints(
                      points.map((p, k) =>
                        k === i ? { ...p, lat: Number(e.target.value) } : p,
                      ),
                    )
                  }
                />
              </label>
              <label className="field">
                Longitude
                <input
                  type="number"
                  step="any"
                  required
                  min={-180}
                  max={180}
                  value={points[i].lng}
                  onChange={(e) =>
                    setPoints(
                      points.map((p, k) =>
                        k === i ? { ...p, lng: Number(e.target.value) } : p,
                      ),
                    )
                  }
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <div className="row">
        <span className="muted">Map clicks set:</span>
        {["Pickup", "Destination"].map((v, i) => (
          <button
            key={v}
            type="button"
            className={`tab ${target === i ? "active" : ""}`}
            onClick={() => setTarget(i)}
          >
            {v}
          </button>
        ))}
      </div>
      <Map
        route={points}
        onSelect={(p) =>
          setPoints(points.map((v, i) => (i === target ? p : v)))
        }
      />
      <p className="caption">
        Locations are a local Pakistan gazetteer; select a place or enter
        coordinates. For custom map points, use route labels below.
      </p>
    </div>
  );
}
const tomorrow = () =>
  new Date(Date.now() + 86400000 + 5 * 3600000).toISOString().slice(0, 10);
const scheduleISO = (date: string, time: string) =>
  new Date(`${date}T${time}:00+05:00`).toISOString();
function Art() {
  return (
    <svg viewBox="0 0 430 240" aria-hidden="true">
      <path
        d="M0 194 Q80 150 150 194 T300 194 T450 194"
        stroke="#b1d7c7"
        strokeWidth="28"
        fill="none"
      />
      <path
        d="M20 194 H420"
        stroke="white"
        strokeWidth="3"
        strokeDasharray="16 10"
      />
      <rect x="75" y="75" width="270" height="110" rx="28" fill="#087d73" />
      <path d="M125 80 L165 25 H275 L320 80" fill="#087d73" />
      <path
        d="M147 74 L175 39 H217 V74zM231 39 H267 L294 74 H231z"
        fill="#c8e6da"
      />
      <rect x="92" y="109" width="31" height="20" rx="7" fill="#fde5a0" />
      <rect x="316" y="109" width="17" height="20" rx="6" fill="#fde5a0" />
      <circle cx="140" cy="180" r="30" fill="#123047" />
      <circle cx="140" cy="180" r="13" fill="#fff" />
      <circle cx="290" cy="180" r="30" fill="#123047" />
      <circle cx="290" cy="180" r="13" fill="#fff" />
      <path
        d="M46 110 V51 M33 51 Q46 16 60 51"
        stroke="#749d7e"
        strokeWidth="14"
        fill="none"
      />
      <circle cx="366" cy="41" r="20" fill="#f3ca77" />
    </svg>
  );
}
function Welcome() {
  return (
    <div className="welcome">
      <header>
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Car />
          </span>
          SathRide
        </Link>
        <div className="row">
          <Link href="/login">Log in</Link>
          <Link className="button" href="/register">
            Get started
          </Link>
        </div>
      </header>
      <main className="welcome-main">
        <div>
          <div className="eyebrow">Made for the everyday journey</div>
          <h1>
            Go Together.
            <br />
            <span style={{ color: "var(--teal)" }}>Spend Less.</span>
          </h1>
          <p>
            Your commute, with better company. Find a ride, share the cost, and
            build a regular carpool with people from your community.
          </p>
          <div className="row">
            <Link className="button" href="/register">
              Find your people <ArrowRight size={17} />
            </Link>
            <Link className="button secondary" href="/login">
              Explore SathRide
            </Link>
          </div>
          <p className="caption" style={{ fontSize: 12, marginTop: 22 }}>
            Islamabad · Rawalpindi · Lahore · Karachi
          </p>
        </div>
        <div className="art">
          <span className="art-tag">
            <ShieldCheck color="#087d73" />
            Communities make commuting personal
          </span>
          <Art />
          <span className="art-tag">
            <Users color="#087d73" />
            One route. More possibilities.
          </span>
        </div>
      </main>
      <div className="welcome-features grid3">
        {[
          [
            Users,
            "Your community, your commute",
            "Join classmates, colleagues, and neighbours travelling your way.",
          ],
          [
            Repeat,
            "Make it a daily thing",
            "Weekday carpool groups with a calendar and a seat for each confirmed journey.",
          ],
          [
            HeartHandshake,
            "Share costs, keep it simple",
            "Agree a contribution in PKR. Pay cash and record your own settlement.",
          ],
        ].map(([Icon, title, text]) => {
          const I = Icon as typeof Users;
          return (
            <div className="card" key={String(title)}>
              <I color="#087d73" size={29} />
              <h2 style={{ marginTop: 16 }}>{String(title)}</h2>
              <p className="muted">{String(text)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function AuthPage({ screen, cap }: { screen: string; cap: any }) {
  const router = useRouter();
  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Car />
          </span>
          SathRide
        </Link>
        <h1>
          Good journeys
          <br />
          start together.
        </h1>
        <p>
          Share your everyday route with people who belong to your community.
        </p>
        <Art />
      </div>
      <div className="auth-form">
        <div className="eyebrow">Go Together. Spend Less.</div>
        <h1>
          {screen === "register"
            ? "Let’s get you moving"
            : screen === "recover"
              ? "Recover your password"
              : screen === "reset"
                ? "Choose a new password"
                : "Welcome back"}
        </h1>
        <p className="muted">
          {screen === "register"
            ? "Create your account, then choose how you want to ride."
            : "Your next shared journey is waiting."}
        </p>
        {screen === "reset" ? (
          <Suspense fallback={<p>Loading recovery form…</p>}>
            <ResetForm />
          </Suspense>
        ) : (
          <Form
            label={
              screen === "register"
                ? "Create account"
                : screen === "recover"
                  ? "Request recovery"
                  : "Log in"
            }
            onSubmit={async (d) => {
              if (screen === "recover") {
                if (!cap?.delivery)
                  throw new Error(
                    "Password recovery is unavailable because delivery is not configured.",
                  );
                await api("auth/request-password-reset", {
                  email: d.email,
                  redirectTo: `${location.origin}/reset`,
                });
                alert(
                  cap.simulation
                    ? "Local simulation. If this account exists, recovery is in the development inbox. Run npm run dev:inbox -- email in the project terminal. No email was sent."
                    : "If the account exists, a recovery request was submitted to the configured provider.",
                );
                return;
              }
              await api(
                screen === "register"
                  ? "auth/sign-up/email"
                  : "auth/sign-in/email",
                {
                  email:
                    screen === "login" &&
                    d.email.trim().toLowerCase() === "admin"
                      ? "admin@demo.sathride.test"
                      : d.email,
                  password: d.password,
                  ...(screen === "register" ? { name: d.name } : {}),
                },
              );
              router.push(screen === "register" ? "/role" : "/dashboard");
              router.refresh();
            }}
          >
            {screen === "register" && (
              <Field label="Full name" name="name" required />
            )}
            <Field
              label={
                screen === "login"
                  ? "Email address or username"
                  : "Email address"
              }
              name="email"
              type={screen === "login" ? "text" : "email"}
              required
            />
            {screen !== "recover" && (
              <Field
                label="Password"
                name="password"
                type="password"
                required
                min={screen === "register" ? 10 : undefined}
                help={
                  screen === "register" ? "At least 10 characters." : undefined
                }
              />
            )}
            {screen === "recover" && !cap?.delivery && (
              <p className="notice warn">
                Recovery disabled until an email delivery provider is
                configured.
              </p>
            )}
            {cap?.simulation && (
              <p className="notice warn">
                Local development mode. External delivery is simulated and
                stored locally.
              </p>
            )}
          </Form>
        )}
        <div className="divider" />
        <div className="row between">
          <Link href={screen === "register" ? "/login" : "/register"}>
            {screen === "register"
              ? "Already have an account? Log in"
              : "Create an account"}
          </Link>
          <Link href="/recover">Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}
function ResetForm() {
  const query = useSearchParams();
  const router = useRouter();
  return (
    <Form
      label="Reset password"
      onSubmit={async (d) => {
        await api("auth/reset-password", {
          token: query.get("token"),
          newPassword: d.password,
        });
        router.push("/login");
      }}
    >
      <Field
        label="New password"
        name="password"
        type="password"
        required
        help="At least 10 characters."
      />
    </Form>
  );
}
export default function SathRide() {
  const path = usePathname(),
    router = useRouter(),
    [revision, setRevision] = useState(0),
    [toast, setToast] = useState(""),
    [view, setView] = useState("PASSENGER"),
    [menu, setMenu] = useState(false),
    [install, setInstall] = useState<any>(null);
  const screen = path.split("/")[1] || "",
    id = path.split("/")[2];
  const { data: cap } = useData("capabilities");
  const { data: me, error: meError } = useData(
    screen &&
      !["login", "register", "recover", "reset", "share"].includes(screen)
      ? "me"
      : null,
    revision,
  );
  const update = useCallback((message = "Saved successfully.") => {
    setRevision((v) => v + 1);
    setToast(message);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const handler = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timeout);
  }, [toast]);
  if (!screen) return <Welcome />;
  if (["login", "register", "recover", "reset"].includes(screen))
    return <AuthPage screen={screen} cap={cap} />;
  if (screen === "share") return <PublicShare id={id} />;
  if (!me)
    return (
      <div className="auth-form">
        <Link className="brand" href="/">
          <Car />
          SathRide
        </Link>
        {meError ? (
          <>
            <p className="notice error" style={{ marginTop: 25 }}>
              {meError}
            </p>
            <Link href="/login" className="button">
              Log in
            </Link>
          </>
        ) : (
          <p className="loading">Loading your account…</p>
        )}
      </div>
    );
  const nav = copy.nav.filter(
    ([p]) => p !== "/offer" || ["DRIVER", "BOTH"].includes(me.role),
  );
  const activeView = me.role === "BOTH" ? view : me.role;
  const logout = async () => {
    await api("auth/sign-out", {});
    router.push("/login");
  };
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-icon">
            <Car size={25} />
          </span>
          SathRide
        </Link>
        <p className="tagline">GO TOGETHER. SPEND LESS.</p>
        <nav>
          {nav.map(([href, label]) => {
            const I = icons[copy.nav.findIndex((n) => n[0] === href)];
            return (
              <Link
                key={href}
                href={href}
                className={`navlink ${path.startsWith(href) ? "active" : ""}`}
              >
                <I size={18} />
                {label}
              </Link>
            );
          })}
          {me.role === "ADMIN" && (
            <Link className="navlink" href="/admin">
              <ShieldCheck size={18} />
              Administration
            </Link>
          )}
        </nav>
        <div className="side-end">
          <div className="notice" style={{ fontSize: 11 }}>
            A little company.
            <br />A lighter commute.
          </div>
          <button
            className="navlink"
            style={{ border: 0, background: "none", marginTop: 15 }}
            onClick={logout}
          >
            <LogOut size={17} />
            Log out
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="desktop-label">
              <strong>Your everyday commute, connected</strong>
              <div className="sub">
                Pakistan · All journey times in Asia/Karachi
              </div>
            </span>
            <Link href="/dashboard" className="brand mobile-nav">
              SathRide
            </Link>
          </div>
          <div className="row">
            {me.role === "BOTH" && (
              <select
                aria-label="Switch driver or passenger view"
                value={view}
                onChange={(e) => setView(e.target.value)}
              >
                <option value="PASSENGER">Passenger view</option>
                <option value="DRIVER">Driver view</option>
              </select>
            )}
            <Link href="/notifications" aria-label="Notifications">
              <Bell size={20} />
            </Link>
            <Link href="/profile" aria-label="Profile">
              <Avatar user={me} />
            </Link>
            <button
              className="button secondary mobile-nav"
              aria-label="Open menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={18} />
            </button>
          </div>
        </header>
        {menu && (
          <div className="card mobile-nav" style={{ margin: 16 }}>
            <nav className="grid">
              {nav.map(([href, label]) => (
                <Link
                  key={href}
                  className="navlink"
                  href={href}
                  onClick={() => setMenu(false)}
                >
                  {label}
                </Link>
              ))}
              {me.role === "ADMIN" && <Link href="/admin">Administration</Link>}
              <button className="button secondary" onClick={logout}>
                Log out
              </button>
            </nav>
          </div>
        )}
        <main className="content">
          {cap?.simulation && (
            <p className="notice warn" style={{ marginBottom: 20 }}>
              Development demonstration · Fictional identities · SMS/email are
              local simulations.
            </p>
          )}
          {!me.profile?.onboarded &&
            !["role", "onboarding", "profile", "verification"].includes(
              screen,
            ) && (
              <p className="notice">
                Complete your profile to make your commute personal.{" "}
                <Link href="/role">Continue onboarding →</Link>
              </p>
            )}
          {screen === "dashboard" ? (
            <Dashboard
              me={me}
              view={activeView}
              revision={revision}
              install={install}
            />
          ) : screen === "find" ? (
            <FindRide />
          ) : screen === "offer" ? (
            <Offer me={me} onDone={update} />
          ) : screen === "rides" && id ? (
            <RideDetails
              id={id}
              me={me}
              revision={revision}
              update={update}
              cap={cap}
            />
          ) : screen === "my-rides" ? (
            <MyRides revision={revision} view={activeView} me={me} />
          ) : screen === "profile" || screen === "onboarding" ? (
            <Profile
              me={me}
              update={update}
              onboarding={screen === "onboarding"}
            />
          ) : screen === "role" ? (
            <RolePage me={me} />
          ) : screen === "verification" ? (
            <Verification
              me={me}
              cap={cap}
              update={update}
              revision={revision}
            />
          ) : screen === "communities" ? (
            <Communities me={me} update={update} revision={revision} />
          ) : screen === "groups" ? (
            <Groups id={id} me={me} update={update} revision={revision} />
          ) : screen === "messages" ? (
            <Messages id={id} me={me} update={update} revision={revision} />
          ) : screen === "notifications" ? (
            <Notifications revision={revision} update={update} />
          ) : screen === "admin" ? (
            <Admin me={me} revision={revision} update={update} />
          ) : (
            <Empty>
              Page not found. <Link href="/dashboard">Return to dashboard</Link>
            </Empty>
          )}
        </main>
      </div>
      <nav className="bottom-nav">
        {[
          ["/dashboard", "Home", Home],
          ["/find", "Find", Search],
          ["/my-rides", "Rides", Route],
          ["/groups", "Groups", Users],
          ["/messages", "Chat", MessageCircle],
        ].map(([href, label, I]) => {
          const Icon = I as typeof Home;
          return (
            <Link
              key={String(href)}
              href={String(href)}
              className={path.startsWith(String(href)) ? "active" : ""}
            >
              <Icon size={22} />
              {String(label)}
            </Link>
          );
        })}
      </nav>
      {toast && (
        <div className="notice toast" role="status">
          {toast}
          <button
            className="button ghost"
            aria-label="Dismiss"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function Dashboard({
  me,
  view,
  revision,
  install,
}: {
  me: any;
  view: string;
  revision: number;
  install: any;
}) {
  const { data: rides, error } = useData("rides", revision),
    { data: mine } = useData("rides?mine=true", revision),
    { data: notifications } = useData("notifications", revision);
  return (
    <div className="stack">
      <div className="row between">
        <div>
          <div className="eyebrow">Your journey starts here</div>
          <h1 style={{ marginBottom: 7 }}>
            Assalam-o-Alaikum, {me.name.split(" ")[0]}.
          </h1>
          <p className="muted">Where are we headed today?</p>
        </div>
        {install && (
          <Action
            secondary
            onClick={async () => {
              await install.prompt();
            }}
          >
            Install web app
          </Action>
        )}
      </div>
      <section className="hero">
        <div className="hero-graphic">
          <Car size={230} />
        </div>
        <div className="eyebrow">Better commutes. Better company.</div>
        <h1>
          Same route?
          <br />
          Let’s ride together.
        </h1>
        <p>
          {view === "DRIVER"
            ? "Turn your daily drive into a shared journey. Offer your spare seats to your community."
            : "Find someone going your way, share the cost, and make the daily commute a little easier."}
        </p>
        <div className="row">
          <Link
            className="button"
            href={view === "DRIVER" ? "/offer" : "/find"}
          >
            {view === "DRIVER" ? <Plus size={17} /> : <Search size={17} />}{" "}
            {view === "DRIVER" ? "Offer a ride" : "Find a ride"}
          </Link>
          <Link className="button secondary" href="/groups">
            <Users size={17} />
            Explore regular carpools
          </Link>
        </div>
      </section>
      <div className="grid3">
        {[
          [
            Route,
            mine?.filter((r: any) => r.status === "SCHEDULED").length || 0,
            "Upcoming journeys",
          ],
          [
            Wallet,
            mine?.filter((r: any) => r.status === "COMPLETED").length || 0,
            "Completed journeys",
          ],
          [
            Bell,
            notifications?.filter((n: any) => !n.read).length || 0,
            "Unread notifications",
          ],
        ].map(([I, n, text]) => {
          const Icon = I as typeof Route;
          return (
            <div className="card stat" key={String(text)}>
              <div className="stat-icon">
                <Icon size={25} />
              </div>
              <div>
                <strong>{String(n)}</strong>
                <small>{String(text)}</small>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row between">
        <h2 style={{ margin: 0 }}>Upcoming rides near our communities</h2>
        <Link href="/find">
          Find your route <ArrowRight size={14} style={{ display: "inline" }} />
        </Link>
      </div>
      <p className="caption" style={{ marginTop: -10 }}>
        Browse scheduled rides, then search to check your route compatibility.
      </p>
      <LoadError error={error} />
      {!rides ? (
        <p className="loading">Loading rides…</p>
      ) : rides.length ? (
        <div className="grid">
          {rides.slice(0, 4).map((r: any) => (
            <RideCard key={r.id} ride={r} />
          ))}
        </div>
      ) : (
        <Empty>
          No upcoming rides yet. Offer the first journey or start a regular
          group.
        </Empty>
      )}
      <div className="notice">
        <ShieldCheck
          size={17}
          style={{ display: "inline", verticalAlign: "middle" }}
        />{" "}
        Verification badges explain checks performed; they do not guarantee
        safety. Manual review is not government or NADRA verification.
      </div>
    </div>
  );
}
function FindRide() {
  const [points, setPoints] = useState<Point[]>([places[0], places[4]]),
    [results, setResults] = useState<any[] | null>(null),
    [mode, setMode] = useState("list");
  return (
    <div className="stack">
      <Title
        title="Find your next ride"
        text="A shared route. A time that works. A little less to spend."
      />
      <section className="card">
        <Form
          label="Find matching rides"
          onSubmit={async (d) =>
            setResults(
              await api("search", {
                pickup: points[0],
                destination: points[1],
                departure: scheduleISO(d.date, d.time),
                flexibility: Number(d.flexibility),
                seats: Number(d.seats),
                preference: d.preference,
                ...(d.maxPrice ? { maxPrice: Number(d.maxPrice) } : {}),
                ...(d.communityId ? { communityId: d.communityId } : {}),
                verified: d.verified === "on",
              }),
            )
          }
        >
          <LocationPicker points={points} setPoints={setPoints} />
          <div className="form-grid">
            <Field
              label="Journey date · Pakistan"
              name="date"
              type="date"
              defaultValue={tomorrow()}
              required
            />
            <Field
              label="Preferred time · Asia/Karachi"
              name="time"
              type="time"
              defaultValue="08:00"
              required
            />
            <Field
              label="Time flexibility · minutes each way"
              name="flexibility"
              type="number"
              defaultValue={60}
              min={0}
              max={720}
              required
            />
            <Field
              label="Seats required"
              name="seats"
              type="number"
              min={1}
              max={12}
              defaultValue={1}
              required
            />
            <Preference />
            <Field
              label="Maximum contribution per seat · PKR (optional)"
              name="maxPrice"
              type="number"
              min={1}
            />
            <CommunitySelect />
            <label className="check">
              <input type="checkbox" name="verified" />
              Identity reviewed drivers only
            </label>
          </div>
        </Form>
      </section>
      {results && (
        <>
          <div className="row between">
            <h2>
              {results.length} compatible ride{results.length !== 1 ? "s" : ""}
            </h2>
            <div className="tabs" style={{ margin: 0 }}>
              {["list", "map"].map((v) => (
                <button
                  key={v}
                  className={`tab ${mode === v ? "active" : ""}`}
                  onClick={() => setMode(v)}
                >
                  {v === "list" ? "List view" : "Map view"}
                </button>
              ))}
            </div>
          </div>
          {mode === "map" && <Map routes={results.map((r) => r.route)} />}
          <p className="caption">
            Matches require pickup and drop-off within 2 km of stored route
            geometry, pickup before drop-off, available seats, eligibility, and
            departure within your time window.
          </p>
          {results.length ? (
            <div className="grid">
              {results.map((r) => (
                <RideCard key={r.id} ride={r} />
              ))}
            </div>
          ) : (
            <Empty>
              No compatible journeys. Try a wider time window or a different
              date.
            </Empty>
          )}
        </>
      )}
    </div>
  );
}
function CommunitySelect() {
  const { data } = useData("communities");
  return (
    <Field label="Community (optional)" name="communityId">
      <option value="">Any / unrestricted</option>
      {data
        ?.filter((c: any) =>
          c.memberships.some((m: any) => m.status === "APPROVED"),
        )
        .map((c: any) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
    </Field>
  );
}
function Offer({
  me,
  onDone,
  group = false,
}: {
  me: any;
  onDone: (s?: string) => void;
  group?: boolean;
}) {
  const router = useRouter(),
    [points, setPoints] = useState<Point[]>([places[0], places[4]]),
    [waypoints, setWaypoints] = useState<Point[]>([]);
  if (!["DRIVER", "BOTH"].includes(me.role))
    return (
      <Empty>
        Add a driver role in <Link href="/profile">your profile</Link> to offer
        rides.
      </Empty>
    );
  if (!me.vehicles.length)
    return (
      <Empty>
        Add your vehicle in <Link href="/profile">Profile & safety</Link> before
        offering a ride.
      </Empty>
    );
  return (
    <div className="stack">
      <Title
        title={group ? "Create a regular carpool" : "Offer a ride"}
        text="Share your route and spare seats. Contributions are agreed shared expenses."
      />
      <div className="card">
        <Form
          label={group ? "Create group & calendar" : "Publish ride"}
          onSubmit={async (d, f) => {
            const base = {
              vehicleId: d.vehicleId,
              pickup: d.pickupLabel || d.pickup,
              destination: d.destinationLabel || d.destination,
              points: [points[0], ...waypoints, points[1]],
              capacity: Number(d.capacity),
              price: Number(d.price),
              preference: d.preference,
              ...(d.communityId ? { communityId: d.communityId } : {}),
            };
            const r = group
              ? await api("groups", {
                  ...base,
                  name: d.name,
                  time: d.time,
                  weekdays: new FormData(f).getAll("weekdays").map(Number),
                })
              : await api("rides", {
                  ...base,
                  departure: scheduleISO(d.date, d.time),
                  luggage: d.luggage,
                  smoking: d.smoking === "on",
                  notes: d.notes,
                });
            onDone(
              group
                ? "Regular carpool created. Upcoming journeys generated."
                : "Your ride is published.",
            );
            router.push(group ? `/groups/${r.id}` : `/rides/${r.id}`);
          }}
        >
          {group && <Field name="name" label="Group name" required />}
          <LocationPicker points={points} setPoints={setPoints} />
          <div className="form-grid">
            <Field label="Custom pickup label (optional)" name="pickupLabel" />
            <Field
              label="Custom destination label (optional)"
              name="destinationLabel"
            />
            <Field name="vehicleId" label="Vehicle">
              {me.vehicles.map((v: any) => (
                <option value={v.id} key={v.id}>
                  {v.make} {v.model} · {v.seats} passenger seats
                </option>
              ))}
            </Field>
            <Field
              label="Passenger seats offered"
              name="capacity"
              type="number"
              defaultValue={3}
              min={1}
              max={12}
              required
            />
            <Field
              name="price"
              label="Contribution per seat · PKR"
              type="number"
              defaultValue={200}
              min={1}
              required
            />
            <Preference value={me.profile?.preference} />
            {!group && (
              <Field
                label="Departure date"
                name="date"
                type="date"
                defaultValue={tomorrow()}
                required
              />
            )}
            <Field
              label="Departure time · Asia/Karachi"
              name="time"
              type="time"
              defaultValue="08:00"
              required
            />
            <CommunitySelect />
            {!group && (
              <>
                <Field
                  name="luggage"
                  label="Luggage allowance"
                  defaultValue="Small bag"
                />
                <label className="check">
                  <input type="checkbox" name="smoking" />
                  Smoking permitted
                </label>
                <Field label="Ride notes" name="notes" type="textarea" />
              </>
            )}
          </div>
          {group && (
            <fieldset className="row">
              <legend>Weekdays</legend>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((v, i) => (
                <label className="check" key={v}>
                  <input
                    name="weekdays"
                    type="checkbox"
                    value={i}
                    defaultChecked={i > 0 && i < 6}
                  />
                  {v}
                </label>
              ))}
            </fieldset>
          )}
          <div className="stack">
            <p className="muted">
              Optional waypoint coordinates · ordered between pickup and
              destination
            </p>
            {waypoints.map((p, i) => (
              <div className="row" key={i}>
                <label className="field">
                  Latitude
                  <input
                    type="number"
                    step="any"
                    value={p.lat}
                    onChange={(e) =>
                      setWaypoints(
                        waypoints.map((v, k) =>
                          k === i ? { ...v, lat: Number(e.target.value) } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  Longitude
                  <input
                    type="number"
                    step="any"
                    value={p.lng}
                    onChange={(e) =>
                      setWaypoints(
                        waypoints.map((v, k) =>
                          k === i ? { ...v, lng: Number(e.target.value) } : v,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="button danger"
                  onClick={() =>
                    setWaypoints(waypoints.filter((_, k) => k !== i))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setWaypoints([...waypoints, { lat: 33.6509, lng: 73.0833 }])
              }
            >
              Add pickup waypoint
            </button>
          </div>
          <p className="notice">
            Female Only and Male Only eligibility applies to the driver and
            every passenger. Pending requests do not reserve seats.
          </p>
        </Form>
      </div>
      {!group && (
        <Link href="/groups/new" className="button secondary">
          <Repeat size={17} />
          Make this a regular weekly carpool instead
        </Link>
      )}
    </div>
  );
}
function RideDetails({
  id,
  me,
  revision,
  update,
  cap,
}: {
  id: string;
  me: any;
  revision: number;
  update: (s?: string) => void;
  cap: any;
}) {
  const { data: r, error } = useData(`rides/${id}`, revision, true),
    [sos, setSos] = useState(false),
    [share, setShare] = useState(""),
    [sharing, setSharing] = useState(false),
    [locationError, setLocationError] = useState("");
  const watch = useRef<number | null>(null),
    lastUpdate = useRef(0);
  const stop = useCallback(() => {
    if (watch.current !== null) {
      navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    }
    setSharing(false);
    api(`location/${id}/stop`, {}).catch(() => {});
  }, [id]);
  useEffect(
    () => () => {
      if (watch.current !== null) {
        navigator.geolocation.clearWatch(watch.current);
        api(`location/${id}/stop`, {}).catch(() => {});
      }
    },
    [id],
  );
  useEffect(() => {
    if (r && r.status !== "IN_PROGRESS" && watch.current !== null) stop();
  }, [r, stop]);
  const startLocation = async () => {
    if (!navigator.geolocation)
      throw new Error("Location is unavailable in this browser.");
    setLocationError("");
    watch.current = navigator.geolocation.watchPosition(
      async (p) => {
        if (Date.now() - lastUpdate.current < 10000) return;
        lastUpdate.current = Date.now();
        try {
          await api(`location/${id}`, {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
          });
          setSharing(true);
        } catch (e) {
          setLocationError((e as Error).message);
          stop();
        }
      },
      (e) => {
        setLocationError(`Location unavailable: ${e.message}`);
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    setSharing(true);
  };
  if (error) return <LoadError error={error} />;
  if (!r) return <p className="loading">Loading journey…</p>;
  const isDriver = r.driverId === me.id,
    confirmed =
      isDriver || ["ACCEPTED", "COMPLETED"].includes(r.myBooking?.status),
    mutate = async (p: string, b: any = {}) => {
      await api(p, b);
      update();
    };
  return (
    <div className="stack">
      <Title
        title={`${r.pickup} → ${r.destination}`}
        text={karachiTime(r.departure)}
        action={
          <span className="badge neutral">{r.status.replace("_", " ")}</span>
        }
      />
      <div className="grid">
        <section className="card stack">
          <Map route={r.route} locations={r.locations || []} />
          <p className="notice">
            {r.routeApproximate
              ? "Approximate geometry connecting stored locations; these are not actual road routes or driving times."
              : "Road-route geometry from the configured routing provider. No live traffic estimates."}
          </p>
          <div className="row between">
            <div className="row">
              <Avatar user={r.driver} />
              <div>
                <strong>{r.driver.name}</strong>
                <div>
                  <Rating user={r.driver} />
                </div>
              </div>
            </div>
            <span className="price">
              {price(r.price)}
              <small style={{ fontSize: 12, fontWeight: 400 }}> / seat</small>
            </span>
          </div>
          <Badges user={r.driver} />
          <div className="row">
            <span className="badge neutral">{pref(r.preference)}</span>
            <span className="badge neutral">{r.available} seats available</span>
          </div>
          <p className="muted">
            <Car size={16} style={{ display: "inline" }} /> {r.vehicle.make}{" "}
            {r.vehicle.model} · {r.vehicle.colour}
            <br />
            Luggage: {r.luggage} ·{" "}
            {r.smoking ? "Smoking permitted" : "No smoking"}
          </p>
          {r.notes && <p>{r.notes}</p>}
          <p className="caption">
            Vehicle registration and private contact information are not
            publicly displayed.
          </p>
        </section>
        <section className="card stack">
          <h2>
            {isDriver
              ? "Manage your journey"
              : r.myBooking
                ? "Your booking"
                : "Ride with this community"}
          </h2>
          {!isDriver && !r.myBooking && r.status === "SCHEDULED" && (
            <Form
              label="Request seats"
              onSubmit={async (d) => {
                await mutate(`rides/${id}/request`, { seats: Number(d.seats) });
                update(
                  "Request sent in-app. The driver must accept to reserve your seats.",
                );
              }}
            >
              <Field
                label="Seats requested"
                name="seats"
                type="number"
                defaultValue={1}
                min={1}
                max={r.available}
                required
              />
              <p className="notice">
                Pending requests do not reserve seats. Pay your agreed
                contribution in cash or as a shared expense.
              </p>
            </Form>
          )}
          {r.myBooking && (
            <div className="notice">
              <strong>Booking {r.myBooking.status.toLowerCase()}</strong>
              <br />
              {r.myBooking.seats} seat(s) · Agreed contribution{" "}
              {price(r.myBooking.contribution)}
              <br />
              Settlement:{" "}
              {r.myBooking.settled
                ? "User-reported settled"
                : "Not reported settled"}
            </div>
          )}
          {r.myBooking &&
            ["PENDING", "ACCEPTED"].includes(r.myBooking.status) &&
            r.status === "SCHEDULED" && (
              <Action
                danger
                confirm="Cancel this booking and release any reserved seats?"
                onClick={() => mutate(`bookings/${r.myBooking.id}/cancel`)}
              >
                Cancel booking
              </Action>
            )}
          {r.myBooking &&
            ["ACCEPTED", "COMPLETED"].includes(r.myBooking.status) && (
              <Action
                secondary
                onClick={() => mutate(`bookings/${r.myBooking.id}/settle`)}
              >
                {r.myBooking.settled
                  ? "Mark not settled"
                  : "Report contribution settled"}
              </Action>
            )}
          <p className="caption">
            Settlement is a participant report, not payment processing or
            payment verification.
          </p>
          {r.myBooking?.events?.length>0&&<details><summary className="check">Booking history</summary>{r.myBooking.events.map((event:any)=><p className="caption" key={event.id}>{event.status.toLowerCase()} · {karachiTime(event.createdAt)}</p>)}</details>}
            {r.myBooking?.conversation && (
            <Link
              className="button secondary"
              href={`/messages/${r.myBooking.conversation.id}`}
            >
              <MessageCircle size={17} />
              Booking conversation
            </Link>
          )}
          {confirmed && r.conversation && (
            <Link
              className="button secondary"
              href={`/messages/${r.conversation.id}`}
            >
              <Users size={17} />
              Confirmed ride conversation
            </Link>
          )}
          {isDriver && r.status === "SCHEDULED" && (
            <>
              <Action onClick={() => mutate(`rides/${id}/start`)}>
                Start ride
              </Action>
              <p className="caption">
                Available within 30 minutes before departure. Undecided requests
                close when the ride starts.
              </p>
              <Action
                danger
                confirm="Cancel this dated ride? All requests will be cancelled and participants notified in-app."
                onClick={() => mutate(`rides/${id}/cancel`)}
              >
                Cancel this journey
              </Action>
              <details>
                <summary className="check">
                  Edit notes and seat capacity
                </summary>
                <Form
                  label="Update ride"
                  onSubmit={(d) =>
                    mutate(`rides/${id}/edit`, {
                      notes: d.notes,
                      capacity: Number(d.capacity),
                    })
                  }
                >
                  <Field
                    name="capacity"
                    label="Passenger capacity"
                    type="number"
                    defaultValue={r.capacity}
                    required
                    min={1}
                    max={r.vehicle.seats}
                  />
                  <Field
                    name="notes"
                    label="Notes"
                    type="textarea"
                    defaultValue={r.notes}
                  />
                </Form>
              </details>
            </>
          )}
          {isDriver && r.status === "IN_PROGRESS" && (
            <Action
              confirm="Complete this ride? Location sharing will stop and reviews will open."
              onClick={() => mutate(`rides/${id}/complete`)}
            >
              Complete ride
            </Action>
          )}
          {r.status === "IN_PROGRESS" && confirmed && (
            <>
              <h3>Active journey & safety</h3>
              <div className="notice">
                Browser location is shared only with confirmed trip
                participants. It stops when the trip ends. A PWA cannot
                guarantee continuous tracking in the background.
              </div>
              <Action secondary onClick={sharing ? stop : startLocation}>
                {sharing
                  ? "Stop & delete my shared location"
                  : "Allow browser location & share"}
              </Action>
              {locationError && <p className="notice error">{locationError}</p>}
              {r.locations.length ? (
                r.locations.map((l: any) => (
                  <p className="caption" key={l.userId}>
                    {l.userId === me.id ? "Your" : "Participant"} location
                    updated {karachiTime(l.updatedAt)} ·{" "}
                    {l.stale
                      ? "Stale"
                      : "Recent"}
                  </p>
                ))
              ) : (
                <p className="caption">
                  Location unavailable: no participant is sharing a recent
                  location.
                </p>
              )}
            </>
          )}
          {confirmed && ["SCHEDULED", "IN_PROGRESS"].includes(r.status) && (
            <>
              <Action
                secondary
                onClick={async () => {
                  const s = await api(`trip-share/${id}`, {});
                  setShare(`${location.origin}/share/${s.token}`);
                  update(
                    "Private share link created. It contains minimal trip information.",
                  );
                }}
              >
                Create share-trip link
              </Action>
              {share && (
                <div className="notice">
                  <a href={share}>{share}</a>
                  <Action
                    secondary
                    onClick={async () => {
                      if (!navigator.clipboard)
                        throw new Error(
                          "Clipboard unavailable. Select and copy the displayed link.",
                        );
                      await navigator.clipboard.writeText(share);
                      update("Link copied.");
                    }}
                  >
                    Copy link
                  </Action>
                </div>
              )}
              {r.shares.map((s: any) => (
                <div className="row" key={s.id}>
                  <small className="muted">
                    Share{" "}
                    {s.revoked
                      ? "revoked"
                      : `expires ${karachiTime(s.expiresAt)}`}
                  </small>
                  {!s.revoked && (
                    <Action
                      danger
                      onClick={() => mutate(`trip-share/${s.id}/revoke`)}
                    >
                      Revoke
                    </Action>
                  )}
                </div>
              ))}
              <button className="button danger" onClick={() => setSos(true)}>
                <AlertTriangle size={17} />
                SOS / emergency options
              </button>
            </>
          )}
          {!isDriver && !r.myBooking && r.status !== "SCHEDULED" && (
            <p className="notice">This ride is no longer accepting bookings.</p>
          )}
        </section>
      </div>
      {isDriver && (
        <section className="card">
          <h2>Passenger requests & participants</h2>
          {r.bookings.length ? (
            r.bookings.map((b: any) => (
              <div className="list-item row between" key={b.id}>
                <div className="row">
                  <Avatar user={b.passenger} />
                  <div>
                    <strong>{b.passenger.name}</strong>
                    <div className="muted">
                      {b.seats} seat(s) · {price(b.contribution)} ·{" "}
                      {b.status.toLowerCase()}
                    </div>
                    <small className="muted">
                      {b.settled
                        ? "User-reported settled"
                        : "Not reported settled"}
                    </small>
                  </div>
                </div>
                <div className="row">
                  {b.status === "PENDING" && r.status === "SCHEDULED" && (
                    <>
                      <Action onClick={() => mutate(`bookings/${b.id}/accept`)}>
                        Accept
                      </Action>
                      <Action
                        danger
                        onClick={() => mutate(`bookings/${b.id}/reject`)}
                      >
                        Reject
                      </Action>
                    </>
                  )}
                  {b.conversation && (
                    <Link
                      className="button secondary"
                      href={`/messages/${b.conversation.id}`}
                    >
                      Message
                    </Link>
                  )}
                  {["ACCEPTED", "COMPLETED"].includes(b.status) && (
                    <Action
                      secondary
                      onClick={() => mutate(`bookings/${b.id}/settle`)}
                    >
                      Toggle reported settlement
                    </Action>
                  )}
                  {b.status === "ACCEPTED" && r.status === "SCHEDULED" && (
                    <Action
                      danger
                      confirm="Cancel this passenger booking?"
                      onClick={() => mutate(`bookings/${b.id}/cancel`)}
                    >
                      Cancel
                    </Action>
                  )}
                </div>
              </div>
            ))
          ) : (
            <Empty>No requests yet. Your ride is ready for passengers.</Empty>
          )}
        </section>
      )}
      {!isDriver &&
        r.bookings.filter((b: any) => b.status === "ACCEPTED").length > 0 && (
          <div className="card">
            <h2>Confirmed participants</h2>
            {r.bookings
              .filter((b: any) => b.status === "ACCEPTED")
              .map((b: any) => (
                <div className="row list-item" key={b.id}>
                  <Avatar user={b.passenger} />
                  {b.passenger.name} · {b.seats} seat(s)
                </div>
              ))}
          </div>
        )}
      {r.status === "COMPLETED" && confirmed && (
        <div className="card">
          <h2>Review your journey</h2>
          <Form
            label="Submit review"
            onSubmit={(d) =>
              mutate("reviews", {
                rideId: id,
                subjectId: d.subjectId,
                rating: Number(d.rating),
                text: d.text,
              })
            }
          >
            <Field label="Participant" name="subjectId">
              {[
                { id: r.driverId, name: r.driver.name },
                ...r.bookings
                  .filter((b: any) => b.status === "COMPLETED")
                  .map((b: any) => b.passenger),
              ]
                .filter((p) => p.id !== me.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Field>
            <Field label="Rating" name="rating" defaultValue="5">
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </Field>
            <Field name="text" label="Your review" type="textarea" required />
          </Form>
          {r.reviews.map((v: any) => (
            <p className="list-item" key={v.id}>
              {v.rating}/5 · {v.text}
            </p>
          ))}
        </div>
      )}
      <div className="card">
        <details>
          <summary className="check sos">
            <AlertTriangle size={17} />
            Report a concern or block the driver
          </summary>
          <Form
            label="Submit private incident report"
            onSubmit={(d) =>
              mutate("reports", {
                rideId: id,
                ...(!isDriver ? { subjectId: r.driverId } : {}),
                reason: d.reason,
              })
            }
          >
            <Field
              label="What happened? At least 10 characters"
              name="reason"
              type="textarea"
              required
            />
          </Form>
          {!isDriver && (
            <Action
              danger
              confirm="Block this driver from initiating new interactions? Existing history remains visible."
              onClick={() => mutate(`blocks/${r.driverId}`, {})}
            >
              Block driver
            </Action>
          )}
        </details>
      </div>
      {sos && (
        <div className="modal-backdrop">
          <section
            className="card modal stack"
            role="dialog"
            aria-modal="true"
            aria-label="Emergency options"
          >
            <h2>Emergency options</h2>
            <p className="notice warn">
              SathRide has not notified police or dispatched help. Use your
              phone to contact someone who can assist.
            </p>
            {me.profile?.emergencyPhone ? (
              <a
                className="button danger"
                href={`tel:${me.profile.emergencyPhone}`}
              >
                Call {me.profile.emergencyName || "your emergency contact"}
              </a>
            ) : (
              <p>Add an emergency contact in Profile & safety.</p>
            )}
            {cap?.emergencyNumber ? (
              <a className="button danger" href={`tel:${cap.emergencyNumber}`}>
                Call configured emergency number
              </a>
            ) : (
              <p className="caption">
                No locally verified emergency number is configured.
              </p>
            )}
            <p>
              {r.pickup} → {r.destination}
              <br />
              {karachiTime(r.departure)}
            </p>
            <Action
              secondary
              onClick={async () => {
                const text = `SathRide trip: ${r.pickup} to ${r.destination}, ${karachiTime(r.departure)}.`;
                if (navigator.share)
                  await navigator.share({ title: "My trip details", text });
                else if (navigator.clipboard) {
                  await navigator.clipboard.writeText(text);
                  update("Trip details copied.");
                } else
                  throw new Error("Select the displayed trip details to copy.");
              }}
            >
              Share trip details
            </Action>
            <Form
              label="Submit incident report (not emergency dispatch)"
              onSubmit={async (d) => {
                await mutate("reports", { rideId: id, reason: d.reason });
                setSos(false);
              }}
            >
              <Field
                name="reason"
                label="Optional incident report, at least 10 characters"
                type="textarea"
                required
              />
            </Form>
            <button className="button secondary" onClick={() => setSos(false)}>
              Close emergency panel
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function PublicShare({ id }: { id: string }) {
  const { data, error } = useData(`share/${id}`, 0, true);
  return (
    <main className="auth-form">
      <Link className="brand" href="/">
        <Car />
        SathRide
      </Link>
      <h1 style={{ marginTop: 30 }}>Shared journey</h1>
      <LoadError error={error} />
      {data && (
        <div className="card">
          <p>
            {data.pickup} → {data.destination}
          </p>
          <p>{karachiTime(data.departure)}</p>
          <span className="badge neutral">{data.status.replace("_", " ")}</span>
          <p className="caption">
            Expires {karachiTime(data.expiresAt)}. No passenger identities or
            precise live locations are shared.
          </p>
        </div>
      )}
    </main>
  );
}
function MyRides({
  revision,
  view,
  me,
}: {
  revision: number;
  view: string;
  me: any;
}) {
  const { data, error } = useData("rides?mine=true", revision),
    [tab, setTab] = useState("Upcoming");
  const rides = data
    ?.filter((r: any) =>
      me.role === "BOTH"
        ? view === "DRIVER"
          ? r.driverId === me.id
          : r.driverId !== me.id
        : true,
    )
    .filter((r: any) =>
      tab === "Pending"
        ? r.bookings.some((b: any) => b.status === "PENDING")
        : tab === "Completed"
          ? r.status === "COMPLETED"
          : tab === "Cancelled"
            ? r.status === "CANCELLED" ||
              r.bookings.some((b: any) =>
                ["CANCELLED", "REJECTED"].includes(b.status),
              )
            : ["SCHEDULED", "IN_PROGRESS"].includes(r.status) &&
              (!r.bookings.length ||
                r.bookings.some((b: any) => b.status === "ACCEPTED")),
    );
  return (
    <div>
      <Title
        title="My rides"
        text="Every request, confirmation, and completed journey stays in your history."
      />
      <div className="tabs">
        {["Upcoming", "Pending", "Completed", "Cancelled"].map((t) => (
          <button
            key={t}
            className={`tab ${t === tab ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <LoadError error={error} />
      {!data ? (
        <p className="loading">Loading history…</p>
      ) : rides.length ? (
        <div className="grid">
          {rides.map((r: any) => (
            <RideCard key={r.id} ride={r} />
          ))}
        </div>
      ) : (
        <Empty>
          No {tab.toLowerCase()} rides. <Link href="/find">Find a ride</Link>
        </Empty>
      )}
    </div>
  );
}
function RolePage({ me }: { me: any }) {
  const router = useRouter();
  return (
    <div className="card stack" style={{ maxWidth: 680, margin: "auto" }}>
      <p className="steps">
        1 Welcome → 2 Account → <strong>3 Role</strong> → 4 Profile → 5
        Verification → 6 Dashboard
      </p>
      <Title
        title="How will you ride?"
        text="You can update your role later in your profile."
      />
      <Form
        label="Continue to profile"
        onSubmit={async (d) => {
          sessionStorage.setItem("sathride-role", d.role);
          router.push("/onboarding");
        }}
      >
        {[
          [
            "PASSENGER",
            "Find a ride",
            "Share a route and contribute to the journey.",
          ],
          ["DRIVER", "Offer a ride", "Offer your spare passenger seats."],
          [
            "BOTH",
            "A little of both",
            "Switch between driver and passenger views.",
          ],
        ].map(([value, title, description]) => (
          <label className="role-card" key={value}>
            <input
              type="radio"
              name="role"
              value={value}
              defaultChecked={me.role === value}
              required
            />
            <div>
              <strong>{title}</strong>
              <div className="muted">{description}</div>
            </div>
          </label>
        ))}
      </Form>
    </div>
  );
}
function Profile({
  me,
  update,
  onboarding,
}: {
  me: any;
  update: (s?: string) => void;
  onboarding: boolean;
}) {
  const router = useRouter(),
    p = me.profile || {};
  const role =
    typeof window !== "undefined" && onboarding
      ? sessionStorage.getItem("sathride-role") || me.role
      : me.role;
  return (
    <div className="stack">
      <Title
        title={onboarding ? "Make yourself at home" : "Profile & safety"}
        text="Private contact details are used for account and safety features, and are not shown on ride listings."
      />
      <div className="grid">
        <section className="card">
          <div className="row" style={{ marginBottom: 24 }}>
            <Avatar user={me} big />
            <div>
              <h2 style={{ marginBottom: 5 }}>{me.name}</h2>
              <p className="muted" style={{ margin: 0 }}>
                {me.email}
              </p>
            </div>
          </div>
          <Form
            label={onboarding ? "Save profile & continue" : "Save profile"}
            onSubmit={async (d) => {
              await api("profile", d);
              update("Profile saved.");
              if (onboarding) router.push("/verification");
            }}
          >
            <div className="form-grid">
              <Field
                name="name"
                label="Full name"
                defaultValue={me.name}
                required
              />
              <Field
                label="Role"
                name="role"
                defaultValue={role === "ADMIN" ? "PASSENGER" : role}
              >
                {["PASSENGER", "DRIVER", "BOTH"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Field>
              <Field
                label="Pakistan mobile number"
                name="phone"
                defaultValue={p.phone}
                required
                help="Normalized to +92; private."
              />
              <Field
                label="City"
                name="city"
                defaultValue={p.city || "Islamabad"}
                required
              />
              <Field
                label="Gender for ride eligibility"
                name="gender"
                defaultValue={p.gender || "UNDISCLOSED"}
              >
                <option value="UNDISCLOSED">Prefer not to provide</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
              </Field>
              <Preference value={p.preference} />
              <Field
                label="University or workplace (optional)"
                name="institution"
                defaultValue={p.institution}
              />
              <Field
                label="Profile picture HTTPS URL (optional)"
                name="image"
                type="url"
                defaultValue={me.image}
              />
              <Field
                label="Emergency contact name (private, optional)"
                name="emergencyName"
                defaultValue={p.emergencyName}
              />
              <Field
                label="Emergency mobile (private, optional)"
                name="emergencyPhone"
                defaultValue={p.emergencyPhone}
              />
              <Field
                label="Short bio"
                name="bio"
                type="textarea"
                defaultValue={p.bio}
              />
            </div>
            <p className="notice">
              Gender is stored privately for server eligibility checks. If you
              do not provide it, you can use Mixed rides. Existing restricted
              journeys must be resolved before changing gender.
            </p>
          </Form>
        </section>
        <div className="stack">
          <section className="card">
            <h2>Your vehicles</h2>
            {me.vehicles.map((v: any) => (
              <div className="list-item" key={v.id}>
                <strong>
                  {v.make} {v.model}
                </strong>
                <p className="muted" style={{ margin: 0 }}>
                  {v.colour} · {v.registration} · {v.seats} passenger seats
                </p>
              </div>
            ))}
            {["DRIVER", "BOTH"].includes(me.role) ? (
              <details open={!me.vehicles.length}>
                <summary className="check">Add a vehicle</summary>
                <Form
                  label="Save vehicle"
                  onSubmit={async (d) => {
                    await api("vehicles", { ...d, seats: Number(d.seats) });
                    update();
                  }}
                >
                  <div className="form-grid">
                    <Field name="make" label="Make" required />
                    <Field name="model" label="Model" required />
                    <Field name="colour" label="Colour" required />
                    <Field
                      name="registration"
                      label="Registration (private)"
                      required
                    />
                    <Field
                      name="seats"
                      label="Passenger seats, excluding driver"
                      type="number"
                      defaultValue={4}
                      min={1}
                      max={12}
                      required
                    />
                  </div>
                </Form>
              </details>
            ) : (
              <p className="muted">Save a driver role to add your vehicle.</p>
            )}
          </section>
          <section className="card stack">
            <h2>Safety & privacy</h2>
            <p className="muted">
              Location updates are retained for at most an hour and are deleted
              when a ride ends. Share links can be revoked from the trip screen.
            </p>
            <Action
              secondary
              onClick={async () => {
                const rides = await api("rides?mine=true");
                for (const r of rides) await api(`location/${r.id}/stop`, {});
                update(
                  "Your shared location records were deleted. Stop active browser sharing from each trip screen.",
                );
              }}
            >
              Delete my shared locations
            </Action>
            <h3>Blocked users</h3>
            {me.blocks.length ? (
              me.blocks.map((b: any) => (
                <div className="row between" key={b.id}>
                  <span>{b.blocked.name}</span>
                  <Action
                    secondary
                    onClick={async () => {
                      await api(`blocks/${b.blockedId}/remove`, {});
                      update();
                    }}
                  >
                    Unblock
                  </Action>
                </div>
              ))
            ) : (
              <p className="muted">
                No blocked users. Use a ride or conversation to block a
                participant.
              </p>
            )}
            <Link href="/verification" className="button secondary">
              Verification status <ChevronRight size={15} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
function Verification({
  me,
  cap,
  update,
  revision,
}: {
  me: any;
  cap: any;
  update: (s?: string) => void;
  revision: number;
}) {
  const { data: inbox } = useData(
    cap?.simulation ? "dev-inbox" : null,
    revision,
  );
  return (
    <div className="stack">
      <Title
        title="Build trust, one check at a time"
        text="Manual document review is a community trust signal. It is not government or NADRA verification and cannot guarantee safety."
      />
      <section className="card">
        <h2>Phone verification</h2>
        <p className="muted">
          Status:{" "}
          {me.verifications.find((v: any) => v.kind === "PHONE")?.status ||
            "NOT_SUBMITTED"}
        </p>
        {cap?.delivery ? (
          <div className="stack">
            <Action
              secondary
              onClick={async () => {
                const d = await api("phone/send", {});
                update(d.message);
              }}
            >
              Request phone code
            </Action>
            {cap.simulation && (
              <p className="notice warn">
                Local simulation only. No SMS is sent. Your latest code appears
                below after requesting.
              </p>
            )}
            <Form
              label="Verify code"
              onSubmit={async (d) => {
                await api("phone/verify", { code: d.code });
                update("Phone challenge completed.");
              }}
            >
              <Field label="Six-digit code" name="code" required />
            </Form>
            {cap.simulation &&
              inbox
                ?.filter((m: any) => m.kind === "phone-code")
                .slice(0, 1)
                .map((m: any) => (
                  <p className="notice warn" key={m.id}>
                    Development inbox code: <strong>{m.text}</strong>
                  </p>
                ))}
          </div>
        ) : (
          <p className="notice warn">
            Phone verification unavailable: an SMS delivery provider is not
            configured.
          </p>
        )}
      </section>
      <div className="grid">
        {["IDENTITY", "UNIVERSITY", "WORKPLACE", "LICENCE", "VEHICLE"].map(
          (kind) => {
            const v = me.verifications.find((v: any) => v.kind === kind);
            return (
              <section className="card stack" key={kind}>
                <div className="row between">
                  <h2 style={{ margin: 0 }}>
                    {kind[0] + kind.slice(1).toLowerCase()} review
                  </h2>
                  <span
                    className={`badge ${v?.status === "REJECTED" ? "danger" : v?.status === "PENDING" ? "warn" : "neutral"}`}
                  >
                    {v?.status || "NOT_SUBMITTED"}
                  </span>
                </div>
                {v?.rejectionReason && (
                  <p className="notice error">
                    Review reason: {v.rejectionReason}
                  </p>
                )}
                <Form
                  label={v ? "Resubmit privately" : "Submit for private review"}
                  onSubmit={async (_, form) => {
                    const data = new FormData(form);
                    data.set("kind", kind);
                    const res = await fetch("/api/upload", {
                      method: "POST",
                      body: data,
                    });
                    const result = await res.json();
                    if (!res.ok) throw new Error(result.error);
                    update(
                      "Document privately submitted. Awaiting manual review.",
                    );
                  }}
                >
                  <label className="field">
                    Document · PDF, JPEG, or PNG · maximum 5 MB
                    <input
                      type="file"
                      name="file"
                      accept="application/pdf,image/png,image/jpeg"
                      required
                    />
                  </label>
                  <Field
                    name="note"
                    label="Review note (private, optional)"
                    type="textarea"
                  />
                  <p className="caption">
                    Only you and administrators can access this document. Use
                    fictional documents for local demonstrations.
                  </p>
                </Form>
                {v && (
                  <a href={`/api/files/${v.id}`} className="button secondary">
                    Download my private submission
                  </a>
                )}
              </section>
            );
          },
        )}
      </div>
      <Link className="button" href="/dashboard">
        Open dashboard <ArrowRight size={17} />
      </Link>
    </div>
  );
}
function Communities({
  me,
  update,
  revision,
}: {
  me: any;
  update: (s?: string) => void;
  revision: number;
}) {
  const { data, error } = useData("communities", revision),
    [creating, setCreating] = useState(false);
  return (
    <div className="stack">
      <Title
        title="Find your people"
        text="University, workplace, and neighbourhood communities. Membership and institution verification are separate."
        action={
          <button className="button" onClick={() => setCreating(!creating)}>
            {creating ? "Close form" : "Create community"}
          </button>
        }
      />
      {creating && (
        <div className="card">
          <Form
            label="Create community"
            onSubmit={async (d) => {
              await api("communities", d);
              setCreating(false);
              update("Community created. You manage membership requests.");
            }}
          >
            <div className="form-grid">
              <Field label="Community name" name="name" required />
              <Field label="Type" name="type">
                <option value="UNIVERSITY">University</option>
                <option value="WORKPLACE">Workplace</option>
                <option value="NEIGHBOURHOOD">Neighbourhood</option>
              </Field>
              <Field label="City" name="city" required />
              <Field
                label="Description"
                name="description"
                type="textarea"
                required
              />
            </div>
          </Form>
        </div>
      )}
      <LoadError error={error} />
      {!data ? (
        <p className="loading">Loading communities…</p>
      ) : (
        <div className="grid">
          {data.map((c: any) => {
            const mine = c.memberships.find((m: any) => m.userId === me.id);
            return (
              <section className="card stack" key={c.id}>
                <div>
                  <div className="community-icon">
                    <Building2 size={27} />
                  </div>
                  <span className="badge neutral">
                    {c.type.toLowerCase()} · {c.city}
                  </span>
                  <h2 style={{ marginTop: 12 }}>{c.name}</h2>
                  <p className="muted">{c.description}</p>
                  <small className="muted">
                    {c._count.memberships} approved members · Created by{" "}
                    {c.owner.name}
                  </small>
                </div>
                {mine && (
                  <span className="badge">
                    Membership: {mine.status.toLowerCase()}
                  </span>
                )}
                {!mine || mine.status === "REJECTED" ? (
                  <Action
                    onClick={async () => {
                      await api(`communities/${c.id}/join`, {});
                      update("Membership request sent.");
                    }}
                  >
                    Request membership
                  </Action>
                ) : null}
                {c.ownerId === me.id && (
                  <div>
                    <h3>Membership requests</h3>
                    {c.memberships.filter((m: any) => m.status === "PENDING")
                      .length ? (
                      c.memberships
                        .filter((m: any) => m.status === "PENDING")
                        .map((m: any) => (
                          <div className="list-item" key={m.id}>
                            <p>{m.user.name}</p>
                            <div className="row">
                              <Action
                                onClick={async () => {
                                  await api(`communities/${c.id}/approve`, {
                                    userId: m.userId,
                                  });
                                  update();
                                }}
                              >
                                Approve
                              </Action>
                              <Action
                                danger
                                onClick={async () => {
                                  await api(`communities/${c.id}/reject`, {
                                    userId: m.userId,
                                  });
                                  update();
                                }}
                              >
                                Reject
                              </Action>
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="caption">No pending requests.</p>
                    )}
                  </div>
                )}
                <p className="caption">
                  Membership does not grant a University reviewed or Workplace
                  reviewed badge.
                </p>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
function Groups({
  id,
  me,
  update,
  revision,
}: {
  id?: string;
  me: any;
  update: (s?: string) => void;
  revision: number;
}) {
  const { data, error } = useData(
    id === "new" ? null : id ? `groups/${id}` : "groups",
    revision,
  );
  if (id === "new") return <Offer me={me} onDone={update} group />;
  if (error) return <LoadError error={error} />;
  if (!data) return <p className="loading">Loading carpools…</p>;
  if (!id)
    return (
      <div className="stack">
        <Title
          title="A familiar ride, every day"
          text="Build a regular commute with your community. Every date has its own confirmed seats."
          action={
            ["DRIVER", "BOTH"].includes(me.role) ? (
              <Link href="/groups/new" className="button">
                <Plus size={17} />
                Create regular carpool
              </Link>
            ) : undefined
          }
        />
        {data.length ? (
          <div className="grid">
            {data.map((g: any) => (
              <section className="card stack" key={g.id}>
                <div className="row between">
                  <Repeat color="#087d73" />
                  <span className="badge neutral">{pref(g.preference)}</span>
                </div>
                <h2>{g.name}</h2>
                <div className="route">
                  <strong>{g.pickup}</strong>
                  <strong>{g.destination}</strong>
                </div>
                <p className="muted">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                    .filter((_, i) => g.weekdays.includes(i))
                    .join(", ")}{" "}
                  · {g.time} Asia/Karachi
                  <br />
                  {g.driver.name} · {g.vehicle.make} {g.vehicle.model}
                </p>
                <div className="row between">
                  <span className="price">
                    {price(g.price)}
                    <small style={{ fontSize: 12 }}> / journey</small>
                  </span>
                  <Link className="button secondary" href={`/groups/${g.id}`}>
                    View group <ArrowRight size={15} />
                  </Link>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Empty>No eligible regular carpools yet.</Empty>
        )}
        <div className="notice">
          Approved group members receive one seat on each available upcoming
          occurrence. Full dates do not overbook: check each day’s booking
          status in the calendar.
        </div>
      </div>
    );
  const g = data,
    driver = g.driverId === me.id,
    mine = g.members.find((m: any) => m.userId === me.id);
  return (
    <div className="stack">
      <Title
        title={g.name}
        text={`${g.time} Asia/Karachi · ${pref(g.preference)} · ${price(g.price)} per journey`}
      />
      <div className="grid">
        <div className="card stack">
          <Map route={g.route} />
          <p>
            {g.pickup} → {g.destination}
          </p>
          <p className="caption">
            Recurring group route is a deterministic geographic approximation.
          </p>
          <div className="row">
            <Avatar user={g.driver} />
            {g.driver.name}
            <Badges user={g.driver} />
          </div>
          <p className="muted">
            {g.capacity} passenger seats per occurrence. Community:{" "}
            {g.community?.name || "Unrestricted"}
          </p>
        </div>
        <div className="card stack">
          <h2>Group membership</h2>
          {mine && <span className="badge">{mine.status}</span>}
          {!driver && (!mine || mine.status === "REJECTED") && (
            <Action
              onClick={async () => {
                await api(`groups/${id}/join`, {});
                update("Group request sent.");
              }}
            >
              Request to join
            </Action>
          )}
          {!driver && mine && ["APPROVED", "PENDING"].includes(mine.status) && (
            <Action
              danger
              confirm="Leave this group and release your future confirmed seats?"
              onClick={async () => {
                await api(`groups/${id}/leave`, {});
                update("You left the group.");
              }}
            >
              Leave group
            </Action>
          )}
          {(driver || mine?.status === "APPROVED") && (
            <Link
              className="button secondary"
              href={`/messages/${g.conversation.id}`}
            >
              Group conversation
            </Link>
          )}
          {driver && (
            <>
              <Action
                secondary
                onClick={async () => {
                  const d = await api(`groups/${id}/generate`, {});
                  update(
                    `${d.created} new journeys generated. Existing dates preserved.`,
                  );
                }}
              >
                Generate next 21 days
              </Action>
              {g.active && (
                <Action
                  danger
                  confirm="Stop generating new journeys? Existing dates remain available to manage individually."
                  onClick={async () => {
                    await api(`groups/${id}/disable`, {});
                    update();
                  }}
                >
                  Disable future generation
                </Action>
              )}
              {g.members.map((m: any) => (
                <div className="list-item" key={m.id}>
                  <p>
                    {m.user.name} · {m.status}
                  </p>
                  {m.status === "PENDING" && (
                    <div className="row">
                      <Action
                        onClick={async () => {
                          await api(`groups/${id}/approve`, {
                            userId: m.userId,
                          });
                          update();
                        }}
                      >
                        Approve
                      </Action>
                      <Action
                        danger
                        onClick={async () => {
                          await api(`groups/${id}/reject`, {
                            userId: m.userId,
                          });
                          update();
                        }}
                      >
                        Reject
                      </Action>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <h2>Upcoming journey calendar</h2>
      <div className="calendar">
        {g.rides.map((r: any) => (
          <div className="card stack" key={r.id}>
            <CalendarDays color="#087d73" />
            <strong>{karachiTime(r.departure)}</strong>
            <span className="badge neutral">{r.status}</span>
            {!driver && (
              <small className="muted">
                {r.skips.length
                  ? "Skipped for this date"
                  : r.bookings[0]
                    ? `Seat ${r.bookings[0].status.toLowerCase()}`
                    : "No seat confirmed for this date"}
              </small>
            )}
            <Link href={`/rides/${r.id}`} className="button secondary">
              Journey details
            </Link>
            {mine?.status === "APPROVED" &&
              r.status === "SCHEDULED" &&
              !r.skips.length && (
                <Action
                  secondary
                  confirm="Skip this date and release its seat? Your group membership stays active."
                  onClick={async () => {
                    await api(`rides/${r.id}/skip`, {});
                    update("This date was skipped.");
                  }}
                >
                  Skip this day
                </Action>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
function Messages({
  id,
  me,
  update,
  revision,
}: {
  id?: string;
  me: any;
  update: (s?: string) => void;
  revision: number;
}) {
  const { data, error } = useData(
      id ? `messages/${id}` : "messages",
      revision,
      true,
    ),
    { data: conversations } = useData(id ? "messages" : null, revision);
  const [recipient, setRecipient] = useState("");
  return (
    <div className="stack">
      <Title
        title={id ? "Your conversation" : "Messages"}
        text="Private conversations for bookings, confirmed rides, and regular carpools. Updates poll every seven seconds."
      />
      <LoadError error={error} />
      {!data ? (
        <p className="loading">Loading messages…</p>
      ) : !id ? (
        data.length ? (
          <section className="card">
            {data.map((c: any) => (
              <Link
                key={c.id}
                href={`/messages/${c.id}`}
                className="list-item row between"
              >
                <div className="row">
                  <span className="stat-icon">
                    <MessageCircle size={22} />
                  </span>
                  <div>
                    <strong>
                      {c.series?.name ||
                        `${(c.ride || c.booking?.ride)?.pickup} → ${(c.ride || c.booking?.ride)?.destination}`}
                    </strong>
                    <p className="caption" style={{ margin: 0 }}>
                      {c.booking
                        ? "Booking"
                        : c.series
                          ? "Group"
                          : "Confirmed ride"}{" "}
                      · {c.messages[0]?.text || "Start a conversation"}
                    </p>
                  </div>
                </div>
                {c.unread && <span className="badge">Unread</span>}
                <ChevronRight size={18} />
              </Link>
            ))}
          </section>
        ) : (
          <Empty>Request a ride or join a group to start a conversation.</Empty>
        )
      ) : (
        <>
          <div className="card">
            <Link href="/messages">← All conversations</Link>
            <div className="message-feed" aria-live="polite">
              {data.length ? (
                data.map((m: any) => (
                  <div
                    key={m.id}
                    className={`bubble ${m.senderId === me.id ? "mine" : ""}`}
                  >
                    <small className="muted">
                      {m.sender.name} · {karachiTime(m.createdAt)}
                    </small>
                    <p style={{ margin: "5px 0" }}>{m.text}</p>
                    {m.senderId !== me.id && (
                      <button
                        className="button ghost"
                        onClick={() => setRecipient(m.senderId)}
                      >
                        Report / block sender
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <Empty>No messages yet.</Empty>
              )}
            </div>
            <Form
              label="Send message"
              onSubmit={async (d, f) => {
                await api(`messages/${id}`, { text: d.text });
                f.reset();
                update("Message saved. Participants were notified in-app.");
              }}
            >
              <Field label="Message" name="text" type="textarea" required />
            </Form>
            <p className="caption">
              {conversations?.find((c: any) => c.id === id)?.series?.name ||
                "Only authorized participants can read and send messages."}
            </p>
          </div>
          {recipient && (
            <div className="card stack">
              <h3>Private report</h3>
              <Form
                label="Report user"
                onSubmit={async (d) => {
                  await api("reports", {
                    subjectId: recipient,
                    reason: d.reason,
                  });
                  setRecipient("");
                  update("Report submitted for admin review.");
                }}
              >
                <Field
                  label="Reason, at least 10 characters"
                  name="reason"
                  type="textarea"
                  required
                />
              </Form>
              <Action
                danger
                confirm="Block this user from new interactions?"
                onClick={async () => {
                  await api(`blocks/${recipient}`, {});
                  setRecipient("");
                  update("User blocked.");
                }}
              >
                Block this user
              </Action>
              <button
                className="button secondary"
                onClick={() => setRecipient("")}
              >
                Close
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function Notifications({
  revision,
  update,
}: {
  revision: number;
  update: (s?: string) => void;
}) {
  const { data, error } = useData("notifications", revision, true);
  return (
    <div className="stack">
      <Title
        title="Stay in the loop"
        text="These are in-app notifications. External push, SMS, and email are not enabled by default."
        action={
          <Action
            secondary
            onClick={async () => {
              await api("notifications", {});
              update("Notifications marked read.");
            }}
          >
            Mark all read
          </Action>
        }
      />
      <LoadError error={error} />
      {data?.length ? (
        <section className="card">
          {data.map((n: any) => (
            <div
              key={n.id}
              className={`list-item notification ${!n.read ? "unread" : ""}`}
            >
              <div className="row between">
                <strong>{n.title}</strong>
                <small className="muted">{karachiTime(n.createdAt)}</small>
              </div>
              <p className="muted" style={{ margin: "8px 0" }}>
                {n.body}
              </p>
              <div className="row">
                <Link className="button secondary" href={n.href}>
                  Open
                </Link>
                {!n.read && (
                  <Action
                    secondary
                    onClick={async () => {
                      await api(`notifications/${n.id}`, {});
                      update();
                    }}
                  >
                    Mark read
                  </Action>
                )}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <Empty>No notifications yet.</Empty>
      )}
    </div>
  );
}
function Admin({
  me,
  revision,
  update,
}: {
  me: any;
  revision: number;
  update: (s?: string) => void;
}) {
  const { data, error } = useData(
    me.role === "ADMIN" ? "admin" : null,
    revision,
  );
  if (me.role !== "ADMIN") return <Empty>Administrator access required.</Empty>;
  const decide = async (id: string, action: string) => {
    const reason = window.prompt(
      action === "reject"
        ? "Rejection reason (required)"
        : "Review or moderation reason (required)",
    );
    if (!reason) return;
    await api(`admin/${id}/${action}`, { reason });
    update("Decision saved with an audit record.");
  };
  return (
    <div className="stack">
      <Title
        title="Administration"
        text="Review documents, address reports, and moderate accounts. Every decision is audited."
      />
      <LoadError error={error} />
      {!data ? (
        <p className="loading">Loading administration…</p>
      ) : (
        <>
          <div className="grid3">
            {Object.entries(data.counts).map(([key, n]) => (
              <div className="card stat" key={key}>
                <strong>{String(n)}</strong>
                <span>{key}</span>
              </div>
            ))}
          </div>
          <section className="card">
            <h2>Verification queue</h2>
            {data.verifications.length ? (
              data.verifications.map((v: any) => (
                <div className="list-item row between" key={v.id}>
                  <div>
                    <strong>
                      {v.user.name} · {v.kind}
                    </strong>
                    <p className="muted" style={{ margin: 0 }}>
                      {v.status} · {v.note || "No review note"}
                    </p>
                    {v.rejectionReason && <p>{v.rejectionReason}</p>}
                  </div>
                  <div className="row">
                    {v.filename && (
                      <a
                        href={`/api/files/${v.id}`}
                        className="button secondary"
                      >
                        Download privately
                      </a>
                    )}
                    {v.kind !== "PHONE" && v.status === "PENDING" && (
                      <>
                        <Action onClick={() => decide(v.id, "approve")}>
                          Approve manual review
                        </Action>
                        <Action danger onClick={() => decide(v.id, "reject")}>
                          Reject with reason
                        </Action>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <Empty>No submissions.</Empty>
            )}
            <p className="notice">
              Do not label manual reviews as government or NADRA verification.
              Phone badges come from the phone challenge; development challenges
              remain simulations.
            </p>
          </section>
          <section className="card">
            <h2>Reports</h2>
            {data.reports.length ? (
              data.reports.map((r: any) => (
                <div className="list-item" key={r.id}>
                  <strong>
                    {r.reporter.name} → {r.subject?.name || "Ride incident"}
                  </strong>
                  <p>{r.reason}</p>
                  {r.rideId && (
                    <p className="caption">Ride reference: {r.rideId}</p>
                  )}
                  {r.resolved ? (
                    <span className="badge">Resolved</span>
                  ) : (
                    <Action secondary onClick={() => decide(r.id, "resolve")}>
                      Resolve with audit reason
                    </Action>
                  )}
                </div>
              ))
            ) : (
              <Empty>No reports.</Empty>
            )}
          </section>
          <section className="card">
            <h2>Accounts</h2>
            {data.users.map((u: any) => (
              <div className="list-item row between" key={u.id}>
                <div>
                  <strong>{u.name}</strong>
                  <p className="caption">
                    {u.email} · {u.role} ·{" "}
                    {u.suspended ? "Suspended" : "Active"}
                  </p>
                </div>
                {u.id !== me.id && (
                  <Action
                    danger={!u.suspended}
                    secondary={u.suspended}
                    confirm={
                      u.suspended
                        ? undefined
                        : "Suspend this account and revoke its sessions?"
                    }
                    onClick={() =>
                      decide(u.id, u.suspended ? "restore" : "suspend")
                    }
                  >
                    {u.suspended ? "Restore" : "Suspend"}
                  </Action>
                )}
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Admin audit trail</h2>
            {data.audits.map((a: any) => (
              <div className="list-item" key={a.id}>
                <strong>{a.action}</strong> · {a.reason}
                <p className="caption">
                  Target {a.target} · {karachiTime(a.createdAt)}
                </p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
