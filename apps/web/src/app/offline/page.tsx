import Link from "next/link";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="rounded-full bg-amber-500/10 p-5">
        <WifiOff className="h-10 w-10 text-amber-400" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">Sem ligação à internet</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Esta página não está disponível offline. Liga-te à internet e tenta novamente.
        </p>
      </div>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>Ainda podes:</p>
        <ul className="space-y-1 text-left">
          <li>• Ver o mapa com os dados guardados</li>
          <li>• Submeter reportes — ficam guardados e enviados quando tiveres ligação</li>
        </ul>
      </div>

      <Link
        href="/map"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Ir para o mapa
      </Link>
    </div>
  );
}
