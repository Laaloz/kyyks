import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function LoadingScreen() {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl items-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_1px_0_0_var(--shadow-soft),0_18px_34px_-24px_var(--shadow)]">
          <Badge className="border-[var(--accent-secondary)] bg-[var(--surface-3)] text-[var(--accent-secondary)]">
            Tarkistetaan istuntoa
          </Badge>
          <CardTitle className="mt-4 text-3xl sm:text-4xl">Ladataan treenityötilaa</CardTitle>
          <CardDescription className="mt-3 max-w-2xl text-base leading-7">
            Päivitetään kirjautuminen, treenit ja viimeisin tila ennen kuin avataan näkymä.
          </CardDescription>
          <div className="mt-6 space-y-3">
            <div className="h-2 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
            </div>
            <p className="text-sm text-[var(--text-subtle)]">
              Jos lataus kestää tavallista pidempään, sovellus jatkaa automaattisesti viimeisimmällä
              paikallisella istunnolla aina kun mahdollista.
            </p>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Card className="border-[var(--border)] bg-[var(--surface-2)]">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vaihe 1</p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">Tunnistetaan käyttäjä</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Varmistetaan sessio ja oikea rooli ennen sisäänpääsyä.</p>
          </Card>
          <Card className="border-[var(--border)] bg-[var(--surface-2)]">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vaihe 2</p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">Synkronoidaan treenit</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Aktiivinen treeni, historia ja työtilan data valmistellaan valmiiksi.</p>
          </Card>
          <Card className="border-[var(--border)] bg-[var(--surface-2)] sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
              />
              <p className="text-sm font-medium text-[var(--text)]">Näkymä avautuu heti kun tiedot ovat valmiit.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
