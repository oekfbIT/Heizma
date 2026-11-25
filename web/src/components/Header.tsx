import { Link, NavLink } from 'react-router-dom';
import logo from '@/assets/brand/heizma-logo.png';

const NAV = [
  { to: '/stammdaten', label: 'Übersicht', end: true },
  { to: '/stammdaten/anfragen', label: 'Anfragen' },
  { to: '/stammdaten/techniker', label: 'Techniker' },
  { to: '/stammdaten/termine', label: 'Termine' },
  { to: '/stammdaten/handlungsbedarf', label: 'Handlungsbedarf' },
];

/** Kopfzeile im Stil von heizma.at: Logo links, Navigation mittig, grüner CTA rechts */
export default function Header() {
  return (
    <header className="sticky top-0 z-[1000] border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-6 px-6 lg:px-10">
        <Link to="/stammdaten" className="flex shrink-0 items-center gap-3" aria-label="Heizma Einsatzplanung">
          <img src={logo} alt="heizma" className="h-9 w-auto" />
          <span className="hidden border-l border-gray-200 pl-3 text-xs font-medium uppercase tracking-wider text-gray-400 sm:inline">
            Einsatzplanung
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `text-[15px] font-medium transition hover:text-brand-600 ${isActive ? 'text-brand-600' : 'text-ink'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <Link to="/planer" className="btn-primary px-6 py-3 text-[15px]">
          Routenplanung öffnen
        </Link>
      </div>
    </header>
  );
}
