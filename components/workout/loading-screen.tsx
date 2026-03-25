import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function LoadingScreen() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10">
      <Card className="w-full border-[var(--border)] bg-[var(--surface)]">
        <Badge className="border-[var(--accent-secondary)] bg-[var(--surface-3)] text-[var(--accent-secondary)]">Tarkistetaan istuntoa</Badge>
        <CardTitle className="mt-4">Ladataan työtilaa</CardTitle>
        <CardDescription className="mt-2">
          Tarkistetaan kirjautuminen ja päivitetään työtilan tiedot ennen näkymän avaamista.
        </CardDescription>
        <p className="mt-3 text-sm text-[var(--text-subtle)]">
          Jos lataus kestää tavallista pidempään, sovellus yrittää jatkaa automaattisesti viimeisimmällä
          paikallisella istunnolla.
        </p>
        <div className="mt-6 h-2 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
        </div>
      </Card>
    </div>
  );
}
