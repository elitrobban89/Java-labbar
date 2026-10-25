# Java-labbar

Webbversionen av två konsolprogram från Java-kursen, så att de går att prova direkt i webbläsaren på
[elitrobban.se/bibliotekshanteraren-och-budgethanteraren](https://elitrobban.se/bibliotekshanteraren-och-budgethanteraren/):

| Labb | Repo | Huvudklass |
|---|---|---|
| 1. Bibliotekshanteraren | [Laboration-1-Bibliotekshanteraren](https://github.com/elitrobban89/Laboration-1-Bibliotekshanteraren) | `org.example.CliApp` |
| 2. Budgethanteraren | [Laboration-2-Budgethanteraren](https://github.com/elitrobban89/Laboration-2-Budgethanteraren) | `CliApp` |

## Hur det fungerar

Labbarnas kod finns **inte** i det här repot. `Dockerfile` klonar båda repona vid varje bygge och kör
deras egna `pom.xml` (Budgethanterarens JUnit-tester körs också, så en röd labb fäller deployen).
Det som körs på sidan är alltså exakt det som ligger på GitHub, och sidan visar vilken commit.

Varje besökare får en **egen JVM-process** med labbens oförändrade `CliApp`. Terminalen på sidan skickar
det man skriver till processens stdin och visar stdout, och stderr med ljus bakgrund (det är där Budgethanterarens
`ConsoleHandler` skriver WARNING och SEVERE). Varje körning har en egen arbetskatalog, så
`transaktioner.csv` och `budget.log` delas inte mellan besökare och raderas när körningen är slut.

```
webbläsare ──POST /api/k/{id}/in──▶ Server ──stdin──▶ java CliApp (egen process)
           ◀──GET /api/k/{id}/ut─── (long-poll) ◀──stdout/stderr──┘
```

| Del | Fil |
|---|---|
| HTTP-server (ren JDK, `com.sun.net.httpserver`, virtuella trådar) | `src/main/java/se/elitrobban/labbar/Server.java` |
| En körning: process, utskriftsbuffert, long-poll | `Korning.java` |
| Var en labb ligger i containern | `Program.java` |
| Terminalsidan | `src/main/resources/public/index.html` |
| Exempelfil till Budgethanteraren (`transaktioner.csv` är gitignorerad i labbrepot) | `exempeldata/budget/transaktioner.csv` |
| Inbäddningen i WordPress | `wordpress-embed.html` |

Gränser: högst 4 körningar samtidigt (varje JVM tar ~40 MB av gratisplanens 512), en körning stängs
efter 2 minuter utan kontakt från fliken eller 30 minuter totalt.

## Terminalen

Terminalen ser ut som de gröna fosforskärmarna i Fallout 4, så att det ska kännas som att sitta vid en
gammal dator. Allt finns i `index.html`, och det gäller båda labbarna.

- **Skärmen:** typsnittet VT323, grön glödande text, scanlines, mörk vinjett, ett svagt flimmer och ett
  ljusband som sakta sveper nedåt. Fel visas med ljus bakgrund, eftersom skärmen bara har en färg.
- **Start:** när ett program startar slås skärmen på som ett gammalt rör, med en ljus linje som vecklas ut.
- **Enter:** raden man skickar lyser upp, och en ljusvåg går genom ramen.
- **Menyval:** rader som `3. Låna bok` eller `e. Avsluta` går att trycka på och skickar valet, så att man
  på mobilen slipper fälla upp tangentbordet. På datorn flyttar pil upp och ned mellan valen och Enter
  skickar det valda, som i Fallout (när man inte har börjat skriva något). Den valda raden lyser upp
  med inverterade färger, och det klickar svagt när man flyttar. Valen
  gäller bara tills man har svarat. Sedan blir de vanlig text igen, så att ett gammalt menyval inte kan
  skickas till en senare fråga.
- **Gnistor:** gröna gnistor när programmet skriver att något lyckades: en bok eller medlem har lagts
  till, en bok lånas ut eller lämnas tillbaka, en transaktion har skapats eller sparats. Raderna känns
  igen med regexen `LYCKAT`.
- **Ljud:** tangentklick, ett pip på Enter och två toner när något lyckas, gjorda med Web Audio. Knappen
  *Ljud* stänger av dem, och valet sparas i webbläsaren.
- Med *minska rörelse* påslaget i systemet stängs animationerna och gnistorna av.

Terminalen har alltid fokus, så man kan skriva direkt utan att klicka. Ett klick var som helst på sidan
(utom på länkar och knappar) eller ett tangenttryck flyttar fokus dit. På mobilen fälls tangentbordet
upp först när man trycker på sidan, inte av sig självt.

Inmatningen går via ett osynligt textfält som ligger inne i terminalen. Det låg tidigare utanför skärmen
och var 1 px brett, och då fastnade mobilens markör först i fältet, så att `12` blev `21`. Markören
hålls nu alltid sist.

## Teknik

Java 27 (Eclipse Temurin), Maven-wrapper, inga beroenden. Ingen Spring: tjänsten startar på under en
sekund även på Renders gratis-CPU. Render free tier, `render.yaml`.

## Uppdatera efter en push till en labb

Render bygger om bara när *det här* repot får en push. Efter en ändring i ett labbrepo: **Manual Deploy**
i Render. Dockerfile hämtar labbarnas senaste commit-referens med `ADD`, så lagercachen bryts och den
nya koden klonas.

## Köra lokalt

```bash
./mvnw package
# bygg labbarna enligt Dockerfile till en katalog med layouten bibliotek/{classes,commit.txt} och
# budget/{classes,lib,start,commit.txt}, sedan:
PORT=8099 LABBAR_DIR=/sökväg/till/layouten java -jar target/java-labbar.jar
```

## Upphov och villkor

© 2026 Robert Andersson Kopler. Fri att läsa, köra lokalt och lära av. Inte att spridas vidare,
publiceras som någon annans, eller användas kommersiellt eller i en konkurrerande tjänst. Se `NOTICE`.
