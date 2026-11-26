import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../cx';
import Icon from './Icon';

/** Seitenrahmen mit einheitlicher Breite und Abständen */
export function Page({ narrow, className, children }: { narrow?: boolean; className?: string; children: ReactNode }) {
  return <main className={cx('page', narrow && 'page--narrow', className)}>{children}</main>;
}

/** Titel + Untertitel, optional Zurück-Link und Aktionen rechts */
export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && <BackLink to={back.to}>{back.label}</BackLink>}
        <h1 className={cx('page-title', back && 'mt-2')}>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="back-link">
      <Icon name="back" className="h-4 w-4" /> {children}
    </Link>
  );
}
