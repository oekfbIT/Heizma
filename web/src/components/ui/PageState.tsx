export function Loading({ label = 'Daten werden geladen …' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-10 text-sm text-gray-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      <p className="font-semibold">Daten konnten nicht geladen werden</p>
      <p className="mt-1">{message}</p>
      <p className="mt-2 text-red-600/80">Token in der .env prüfen oder mit DATA_SOURCE=mock offline starten.</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-3">
          Erneut versuchen
        </button>
      )}
    </div>
  );
}
