import { Alert } from './Alert';
import { Button } from './Button';

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Loading({ label = 'Daten werden geladen …' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-10 text-sm text-gray-500" role="status">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert tone="danger" className="m-6 p-5">
      <p className="font-semibold">Daten konnten nicht geladen werden</p>
      <p className="mt-1">{message}</p>
      <p className="mt-2 text-danger-600/80">Bitte den Token in der .env prüfen oder die App mit DATA_SOURCE=mock offline starten.</p>
      {onRetry && (
        <Button className="mt-3" onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </Alert>
  );
}
