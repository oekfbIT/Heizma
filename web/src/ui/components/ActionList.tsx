/**
 * @file      ActionList.tsx – UI-Baustein: Auswahl-Liste in einem Dialog („Was möchtest du tun?“)
 * @layer     Web · Design-System (Komponente)
 * @siehe     docs/05-design-system.md#aktionen-karten-zeigen-dialoge-ändern · docs/10-code-navigation.md
 */
import { cx } from '../cx';
import Icon from './Icon';

export interface ActionItem {
  key: string;
  title: string;
  /** Ein Satz: was passiert danach */
  description: string;
  icon?: string;
  tone?: 'default' | 'warning';
  onSelect: () => void;
}

/**
 * Aktionen-Muster: Karten zeigen den Status, Änderungen laufen über einen Dialog.
 * Der Dialog listet die möglichen Schritte mit je einem erklärenden Satz – statt einer Reihe gleich aussehender Buttons.
 */
export function ActionList({ items }: { items: ActionItem[] }) {
  return (
    <ul className="action-list">
      {items.map((a) => (
        <li key={a.key}>
          <button type="button" className={cx('action-row', a.tone === 'warning' && 'action-row--warning')} onClick={a.onSelect}>
            {a.icon && (
              <span className="action-row__icon">
                <Icon name={a.icon} className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="action-row__title">{a.title}</span>
              <span className="action-row__desc">{a.description}</span>
            </span>
            <Icon name="chevron" className="h-4 w-4 shrink-0 text-gray-300" />
          </button>
        </li>
      ))}
    </ul>
  );
}
