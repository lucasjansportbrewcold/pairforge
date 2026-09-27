# Pairforge

Een indelingsprogramma voor het FIDE (Dutch) Swiss-systeem (FIDE Handbook C.04.3, regels van
2017), geschreven in JavaScript. Het gedraagt zich als **JaVaFo 2.2** (build 3222) van Roberto
Ricca: dezelfde commandoregel, dezelfde invoer en byte voor byte dezelfde indelingen, check-lists
en checker-uitvoer. Dat is gecontroleerd door de originele `javafo.jar` en Pairforge op
tienduizenden rondes naast elkaar te laten draaien (zie [Verificatie](#verificatie)). Er is geen
code van JaVaFo gebruikt; de jar diende alleen als referentie om tegen te testen.

## Gebruik

Eén bestand, niets te installeren: `pairforge.exe` (Windows). De commandoregel is gelijk aan die
van `javafo.jar`:

```bash
pairforge.exe toernooi.trfx -p indeling.txt
```

```
pairforge [-r]
pairforge [-r] input-file -c [round-number]
pairforge [-r] input-file [-b] -p [output-file] [-l [check-list-file]]
pairforge [-r] [model-file] -g [-b] -o trf-file
pairforge [-r] -g config-file|seed [-b] -o trf-file
```

Met Node.js (>= 18) kan het ook zonder exe: `node bin/pairforge.js …`.

### De exe bouwen

```bash
npm install
npm run build
```

Dit maakt `dist/pairforge.exe` (op macOS/Linux `dist/pairforge`, te bouwen op dat systeem): het
programma gebundeld (esbuild) en in een kopie van Node geïnjecteerd (Node "single executable
application"). Het bestand is niet digitaal ondertekend, dus Windows kan bij de eerste keer starten
na downloaden een SmartScreen-waarschuwing geven.

| optie | betekenis |
|---|---|
| `-p [bestand]` | indeling van de volgende ronde (zonder bestand naar stdout) |
| `-l [bestand]` | check-list (standaard `<invoer>.list` naast het invoerbestand) |
| `-c [ronde]` | pairings checker: deelt elke (of één) gespeelde ronde opnieuw in en toont de verschillen |
| `-b` | Baku-versnelling |
| `-g [config\|seed]`, `-o bestand` | willekeurig toernooi genereren |
| `-r` | versie tonen |

Relatieve uitvoerpaden worden, net als bij JaVaFo, opgelost ten opzichte van de map van het
invoerbestand. Getallen in de check-list krijgen het decimaalteken van de systeemlocale (zoals
Java); afdwingen kan met de omgevingsvariabele `PAIRFORGE_DECIMAL` (bijv. `PAIRFORGE_DECIMAL=.`).

### Als bibliotheek

```js
import { Tournament } from './src/tournament.js';
import { checklist } from './src/checklist.js';

const t = Tournament.fromText(trfTekst, 'toernooi.trfx'); // bestandsnaam: zie "beginkleur"
const r = t.pair();                  // { round, pairs: [[wit, zwart]], bye, players, ... }
const tekst = checklist(r);          // check-list als string
```

Daarnaast is er `exec(operatie, ...params)` in `src/api.js`, naar het voorbeeld van
`JaVaFoApi.exec` (1000 indeling, 1001 met Baku, 1100/1110/1111 check-lists, 1200/1210 checker,
1300/1301 generator).

## Ondersteunde TRF(x)-uitbreidingen

`XXR` (aantal rondes), `XXC rank|white1|black1`, `XXA` (versnellingspunten), `XXP` (verboden
paren), `XXZ` (afwezigen), `XXS` (puntensysteem). Zonder `XXS` wordt het puntensysteem, zoals bij
JaVaFo, afgeleid uit het veld Points.

## Hoe het werkt

De indeling volgt C.04.3 letterlijk: scoregroepen van boven naar beneden, met de speciale route
voor de *penultimate pairing bracket* en de *collapsed last bracket* (A.9). Per groep wordt de
kandidaat gekozen die de kwaliteitscriteria C.5–C.19 het best vervult en, bij gelijke kwaliteit,
als eerste gegenereerd zou worden volgens de transposities en uitwisselingen van sectie D.

* **Snelle route** – de kandidaten worden in de exacte volgorde van sectie B/D afgelopen; de
  eerste die op elk criterium de theoretische ondergrens haalt is aantoonbaar optimaal én de
  eerste, en wordt direct geaccepteerd. Dat dekt de grote meerderheid van de groepen.
* **Exacte route** – anders wordt het probleem een *maximum weighted matching* (eigen
  implementatie van Edmonds' blossom-algoritme, `src/blossom.js`) met lexicografische
  BigInt-gewichten: eerst de kwaliteitscriteria, daarna in vier stappen de genereervolgorde
  (MDP-uitwisseling D.3, transpositie D.1, resident-uitwisseling D.2, transpositie D.1).
  Volledigheid van de ronde wordt gecontroleerd met een snelle *maximum cardinality matching*
  (`src/cardinality.js`). De vooruitblik van C.7 wordt, als er hoogstens één speler afzakt,
  per mogelijke afzakker exact uitgerekend in plaats van meegenomen in de matching.

Waar JaVaFo afwijkt van de letterlijke tekst, volgt deze versie JaVaFo (gevonden door vergelijken;
de details staan als commentaar in de code):

* beginkleur: afgeleid van (bestandsnaam, toernooinaam) bij ronde 1, daarna van de gespeelde eerste
  ronde; E.5 nummert de spelers die aanwezig zijn of al eens ingedeeld waren;
* E.2 rangschikt absolute voorkeuren (WWW > WW > W1 > W) en vergelijkt geen kleurverschillen;
* bij een absolute voorkeur beslist het teken van het kleurverschil, niet de laatste twee partijen;
* C.8 en C.9 worden geteld als "krijgt zijn voorkeur niet" bij |kleurverschil| ≥ 2 resp. twee
  gelijke laatste kleuren;
* C.7 houdt rekening met de bye (C.2) als de volgende groep de laatste is;
* Baku: vast schema (rondes 1–3: 1 punt, 4–5: ½ punt), groep A op basis van de deelnemers van
  ronde 1 en de spelers-id's, alleen bij standaardpunten en minstens 9 rondes.

## Verificatie

De map `test/tools` bevat de vergelijkingsgereedschappen (ze hebben `javafo.jar` in de projectmap
en een Java-runtime nodig):

| gereedschap | wat het doet |
|---|---|
| `gen.mjs` | laat `javafo.jar` willekeurige toernooien genereren |
| `pcompare.mjs` | deelt elke ronde van die toernooien opnieuw in en vergelijkt |
| `variants.mjs` + `oracle.mjs` | maakt varianten (versnelling, verboden paren, rank, beginkleur, afwezigen, puntensystemen, late instromers) en vergelijkt indeling én check-list byte voor byte |
| `checkoracle.mjs` | vergelijkt de checker-uitvoer, ook na gerichte verstoringen (geruilde paren, gewisselde kleuren) |
| `rtgcheck.mjs` | laat de originele checker toernooien uit onze generator controleren |

Resultaat bij de laatste run: 0 verschillen op 6828 rondes uit door JaVaFo gegenereerde
toernooien (waarvan 1673 met extreem veel forfaits en afwezigen), 1683 varianten met indeling én
check-list byte voor byte (inclusief Baku, rank, late instromers en 3-1-0 zonder XXS), de checker op
ruim 1000 (verstoorde) toernooien en een toernooi van 1000 spelers; de originele checker keurde alle
~2800 rondes uit onze generator goed. `fastslow.mjs` controleert bovendien de snelle route tegen de
exacte matching (0 verschillen op 1314 rondes).

`npm test` draait de eigen tests (de matching-algoritmen en vaste referentie-uitvoer van JaVaFo).

## Snelheid

Gemiddeld 2–3 ms per ronde over toernooien van 15–415 spelers (de zwaarste van 4376 rondes: 75 ms);
een toernooi van 1000 spelers en 9 rondes wordt in totaal in ~1 s ingedeeld, waar `javafo.jar` er
~5 s over doet. Het meeste werk doet de snelle route; de exacte matching is alleen nodig in groepen
waar de onvermijdelijke kleurconflicten of floats de ondergrens niet halen.

## Bekende verschillen met JaVaFo

* **Programmanaam**: de laatste regel van de check-list en de uitvoer van `-r` noemen Pairforge in
  plaats van JaVaFo. Verder is de check-list byte voor byte gelijk.
* **Generator (`-g`)**: zelfde parameters, bestandsformaat en uitslagkansen (O. Milvang, 2016),
  maar een seed levert niet hetzelfde bestand op als bij JaVaFo: daarvoor zou de interne
  toevalsgenerator van de (geobfusceerde) jar nagemaakt moeten worden.
* **Puntensysteem afleiden uit inconsistente Points** (verouderd in JaVaFo 2.2): bij consistente
  gegevens identiek, ook voor niet-standaard systemen zonder `XXS`; bij tegenstrijdige Points kan
  de afgeleide waarde verschillen.
* De verborgen XML-uitvoer van JaVaFo (`-x`, die met moderne Java niet meer werkt) is niet
  nagebouwd. Waar JaVaFo crasht (bijv. niet-doorlopende spelernummers) geeft deze versie gewoon een
  indeling; waar JaVaFo met een NullPointerException stopt omdat alle rondes al gespeeld zijn,
  geeft deze versie een leesbare foutmelding. In beide gevallen: exitcode 1 en geen uitvoerbestand.
* **Foutmeldingen** zijn eigen, korte teksten (`Error: ...`). Zoals bij JaVaFo komen ze op stdout,
  eindigt het programma met exitcode 1 en wordt er geen uitvoerbestand gemaakt.

Net als JaVaFo vereist indelen (`-p`, `-l`) een `XXR`-regel; de checker (`-c`) niet.
