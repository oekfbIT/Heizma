import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import logo from '@/assets/brand/heizma-logo.png';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';

const NAV = [
  { to: '/stammdaten', label: 'Übersicht', end: true },
  { to: '/stammdaten/anfragen', label: 'Anfragen' },
  { to: '/stammdaten/techniker', label: 'Außendienst' },
  { to: '/stammdaten/termine', label: 'Termine' },
  { to: '/hilfe', label: 'Hilfe' },
];

/**
 * Kopfzeile im Stil von heizma.at: Logo links, Navigation mittig, grüner CTA rechts.
 * Mobil: Logo, kompakter Planer-Button und Menü (Drawer).
 */
export default function Header() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="sticky top-0 z-[1000] border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-[60px] max-w-[1440px] items-center justify-between gap-4 px-4 md:h-[72px] md:px-6 lg:px-10">
        <Link to="/stammdaten" className="flex shrink-0 items-center gap-3" aria-label="Heizma Einsatzplanung">
          <img src={logo} alt="heizma" className="h-7 w-auto md:h-9" />
          <span className="hidden border-l border-gray-200 pl-3 text-xs font-medium uppercase tracking-wider text-gray-400 xl:inline">
            Einsatzplanung
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `text-[15px] font-medium transition hover:text-brand-600 ${isActive ? 'text-brand-600' : 'text-ink'}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 md:gap-4">
          <Link to="/planer" className="btn-primary px-3.5 py-2 text-sm md:px-6 md:py-3 md:text-[15px]">
            <Icon name="route" className="h-4 w-4 md:hidden" />
            <span className="md:hidden">Routen</span>
            <span className="hidden md:inline">Routenplanung öffnen</span>
          </Link>
          {user && (
            <button
              onClick={logout}
              title={`${user.email} · Sitzung bis ${new Date(user.expiresAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`}
              className="hidden text-sm font-medium text-gray-500 transition hover:text-brand-600 lg:inline"
            >
              Abmelden
            </button>
          )}
          <button onClick={() => setOpen(!open)} className="rounded-lg p-2 text-ink hover:bg-gray-100 lg:hidden" aria-label="Menü" aria-expanded={open}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobiles Menü */}
      {open && (
        <div className="border-t border-gray-100 bg-white px-4 pb-4 pt-2 shadow-lg lg:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-3 text-[15px] font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-gray-50'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {user && (
            <button onClick={logout} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-3 text-left text-sm font-medium text-gray-600">
              Abmelden <span className="text-gray-400">· {user.email}</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}
