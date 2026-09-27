# javafo-js

Een stand-alone JavaScript-nabouw van **JaVaFo 2.2** (build 3222), de indelingsmotor voor het
FIDE (Dutch) Swiss-systeem (FIDE Handbook C.04.3, regels van 2017). Geen afhankelijkheden:
alleen Node.js (>= 18).

Het doel is identiek gedrag: dezelfde indeling, dezelfde bestanden, byte voor byte. Dat is
gecontroleerd door de originele `javafo.jar` en deze versie op tienduizenden rondes naast elkaar
te laten draaien (zie [Verificatie](#verificatie)).

## Gebruik

De command line is gelijk aan die van `javafo.jar`:

```bash
node bin/javafo.js toernooi.trfx -p indeling.txt
```

```
javafo [-r]
javafo [-r] input-file -c [round-number]
javafo [-r] input-file [-b] -p [output-file] [-l [check-list-file]]
javafo [-r] [model-file] -g [-b] -o trf-file
javafo [-r] -g config-file|seed [-b] -o trf-file
```

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
Java); afdwingen kan met de omgevingsvariabele `JAVAFO_DECIMAL` (bijv. `JAVAFO_DECIMAL=.`).

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

Resultaat bij de laatste run: 0 verschillen op o.a. 4376 + 1673 rondes uit gegenereerde
toernooien, ruim 1500 varianten (inclusief Baku) en de checker op ruim 1000 (verstoorde)
toernooien; de originele checker keurde alle ~2800 rondes uit onze generator goed.

`npm test` draait de eigen tests (de matching-algoritmen en vaste referentie-uitvoer van JaVaFo).

## Snelheid

Gemiddeld ~15 ms per ronde over toernooien van 15–415 spelers; de zwaarste rondes (±380 spelers,
ronde 2–3) nemen ~0,5 s, sneller dan `javafo.jar` op dezelfde invoer.

## Bekende verschillen

* **Generator (`-g`)**: zelfde parameters, bestandsformaat en uitslagkansen (O. Milvang, 2016),
  maar een seed levert niet hetzelfde bestand op als bij JaVaFo: daarvoor zou de interne
  toevalsgenerator van de (geobfusceerde) jar nagemaakt moeten worden.
* **Puntensysteem afleiden uit inconsistente Points** (verouderd in JaVaFo 2.2): bij consistente
  gegevens identiek, ook voor niet-standaard systemen zonder `XXS`; bij tegenstrijdige Points kan
  de afgeleide waarde verschillen.
* De verborgen XML-uitvoer van JaVaFo (`-x`, die met moderne Java niet meer werkt) is niet
  nagebouwd. Waar JaVaFo crasht (bijv. niet-doorlopende spelernummers) geeft deze versie gewoon een
  indeling.
