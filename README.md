# TempoFit

Prototipo web mobile-first per pianificare e registrare allenamenti di forza e
ipertrofia in base al tempo disponibile. Interfaccia originale ispirata alla
semplicita dei workout tracker, senza utilizzare marchi, schermate o asset Hevy.

## Sito pubblico

<https://gianmarcotacchini92.github.io/tempofit/>

Il sito funziona senza server locale. I dati di allenamento restano nel browser:
la pubblicazione del codice non pubblica lo storico personale. Il sito pubblico
ha un archivio separato da quello su `127.0.0.1`: per trasferire i dati, esportare
un backup JSON dall'app locale e importarlo nel sito pubblico, su un archivio
vuoto. Lo stesso vale passando a un altro dispositivo o browser.

## Pubblicazione su GitHub Pages

Il workflow `.github/workflows/deploy-pages.yml` pubblica automaticamente ogni
push su `main`, dopo test, lint e build; puo anche essere avviato da GitHub
Actions con **Run workflow**. In **Settings > Pages**, la sorgente deve essere
**GitHub Actions**. Non servono token personali nei file o nei secrets del
repository: il deploy usa il token temporaneo del workflow.

La build `github-pages` usa il percorso `/tempofit/`; sviluppo e build standard
mantengono `/`. Per provare localmente la versione destinata a Pages:

```powershell
npm.cmd run build -- --mode github-pages
npm.cmd run preview -- --mode github-pages --host 127.0.0.1 --port 4173 --strictPort
```

Aprire <http://127.0.0.1:4173/tempofit/>. Se cambia il nome del repository,
aggiornare il percorso in `vite.config.ts` e il link del sito in questo documento.

## Avvio su Windows

Richiede Node.js 24 e npm.

```powershell
Set-Location 'C:\Projects\TempoFit'
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Aprire <http://127.0.0.1:5173>. Il server resta attivo finche il processo non viene
interrotto. `npm.cmd` evita problemi con l'execution policy di PowerShell senza
modificare le impostazioni di sicurezza del sistema.

## Funzionalita

- Dashboard con dati reali, settimana corrente e punti di partenza personalizzabili.
- Generazione deterministica per tempo, muscoli in ordine di priorita, obiettivo,
  esperienza, attrezzatura, preferenze ed esclusioni.
- Petto, schiena, spalle, gambe, bicipiti, tricipiti e core. I glutei non sono una
  voce separata: i relativi esercizi restano nel catalogo sotto Gambe.
- Il primo gruppo selezionato e il focus, visibile nella configurazione,
  nel piano e nella sessione. Tutto il suo lavoro viene prima degli altri gruppi,
  che seguono l'ordine di selezione. Per cambiare ordine basta deselezionare
  e riselezionare i gruppi; togliendo il primo, il secondo diventa focus.
- Copertura minima di tutti i gruppi, poi precedenza al focus nelle aggiunte
  utili e un complemento in piu da 45 minuti, se tempo, varianti e volume lo
  consentono. Priorita non significa piu serie indiscriminatamente o cedimento.
  Sul focus si preferisce la variante gia registrata, per rendere confrontabile
  il progresso, salvo preferenze, esclusioni, attrezzatura e tempo disponibile.
- Stime comprensive di riscaldamento, avvicinamento, esecuzione, recuperi,
  transizioni, registrazione e margine operativo.
- Sessioni lunghe con piu esercizi complementari per gruppo: il numero dipende
  dal tempo per gruppo e dal livello, non da un tetto fisso di un esercizio.
  Lo stimolo distingue ad esempio squat/affondi, ponte/stacco rumeno e
  spinta orizzontale/inclinata. Varianti quasi identiche non riempiono il piano.
  Restano attivi i limiti di serie per livello e per gruppo; il riepilogo mostra
  esercizi e serie di ogni muscolo e segnala il tempo ampiamente inutilizzato.
- Preset fino a 120 minuti e recupero minimo personale (90, 120 o 180 secondi).
  Il minimo viene rispettato anche nell'editor: il generatore riduce il lavoro,
  non i recuperi, quando il tempo non basta.
- Accessori per gruppi collegati solo su scelta esplicita e da 60 minuti:
  prima vengono i muscoli selezionati, poi eventuali isolamenti. Nessun
  riempimento con piu curl equivalenti; gli accessori sono indicati nel piano.
  I vecchi salvataggi, privi dell'opzione, mantengono gli accessori disattivati.
- Modifica delle prescrizioni e sostituzioni compatibili prima della sessione.
  Un piano non valido o fuori budget non puo essere avviato.
- Registrazione di serie, carico, ripetizioni e RIR facoltativo, con annullamento
  della singola registrazione.
- Timer basato su timestamp persistito, ripristino della sessione dopo reload,
  salvataggio di sessioni complete o parziali.
- Storico, grafico dei carichi della stessa variante e distribuzione delle serie
  sui muscoli principali.
- Progressi con filtri 3 mesi, 6 mesi, 1 anno e Max, senza limite di sessioni.
  I periodi partono dalla data odierna (mesi di calendario); Max include tutto
  lo storico completato fino a oggi. Riepiloghi e distribuzione muscolare restano
  riferiti all'intero storico.
- Peso utilizzato mostra solo il carico piu pesante registrato per sessione,
  con il dettaglio della serie corrispondente (la prima a parita di peso).
  Volume della serie (peso registrato x ripetizioni) mantiene un punto per
  ogni serie effettiva. Carico massimale mostra invece
  la migliore stima 1RM della sessione (Epley, solo 1-10 ripetizioni e carico
  positivo; con una ripetizione si usa il peso registrato). Non e una misura
  del massimale ne una prescrizione, non usa il RIR e non si applica al corpo
  libero senza un peso corporeo registrato. Peso e volume non raddoppiano
  automaticamente manubri, lati o zavorre.
- Grafico esplorabile con mouse, tocco, frecce della tastiera e pulsanti
  Precedente/Successivo: dettagli di data, serie, carico, ripetizioni, volume
  e RIR. I punti sono equidistanti in ordine cronologico, non proporzionali
  al tempo trascorso; i valori mancanti non diventano zero.
- Proposte di aumento del carico solo sul focus, dopo due esposizioni complete
  comparabili al limite alto delle ripetizioni e con RIR adeguato. Anche serie,
  range e recuperi della nuova prescrizione devono essere comparabili.
  Sugli altri gruppi si ripropone il carico registrato senza aumento automatico.
  Le note del focus invitano a migliorare le ripetizioni mantenendo RIR e tecnica,
  non promettono un incremento a ogni seduta. Modifiche manuali rimuovono la
  vecchia nota per non presentare come attuale una proposta ormai modificata.
  Nel misto il blocco pesante appartiene al focus: se mancano fondamentali
  caricabili per quel gruppo (es. bicipiti), si mantiene lavoro controllato
  e si esplicita il limite, senza spostare il blocco forza su un altro muscolo.
- Esportazione/importazione JSON e cancellazione dei soli dati TempoFit.
- Importazione diretta di CSV Hevy: le sedute vengono raggruppate per data,
  le serie di riscaldamento vengono escluse dal lavoro registrato, RPE viene
  convertito in una stima RIR conservativa e gli esercizi vengono associati
  solo a mapping espliciti del catalogo. Le varianti non riconosciute sono
  elencate nel messaggio d'importazione e non vengono assegnate arbitrariamente.

## Dati e limiti del prototipo

I dati sono salvati in `localStorage`, sotto la chiave `tempofit.local.v1`.
Il contenuto usa ora lo schema `version: 2`, mantenendo la stessa chiave per
ritrovare gli archivi esistenti. La stessa migrazione validata e usata per
caricamento locale e importazione: Glutei diventa Gambe, Braccia viene espanso
in Bicipiti e Tricipiti, in questo ordine convenzionale, eliminando i doppioni.
L'ordine originario fra bicipiti e tricipiti non e ricostruibile: ricontrollare
il focus nella configurazione. ID, nomi storici, serie, carichi, registrazioni
e timer restano invariati; le serie non vengono duplicate. I piani gia salvati
non vengono riscritti dal generatore: rigenerarli per applicare le nuove priorita.
Non esistono account, backend, sincronizzazione cloud o chiamate a un LLM.
Lo storico iniziale e vuoto: nessuna prestazione dimostrativa viene mescolata
con i dati dell'utente.

Il salvataggio e specifico del browser e dell'origine: `localhost` e `127.0.0.1`,
cosi come porte differenti, hanno archivi separati. Cancellare i dati del sito
elimina anche lo storico. Esportare periodicamente un backup dal profilo.
L'importazione JSON o CSV richiede un archivio vuoto per evitare sovrascritture.
Modifiche rilevate da un'altra scheda bloccano le nuove scritture finche non si
ricarica la pagina. Dati corrotti non vengono sovrascritti automaticamente.

Gli asset grafici e i font DM Sans e Manrope sono inclusi localmente.
L'app non effettua richieste a servizi di terze parti.
Una pagina gia aperta salva senza rete, ma non e presente un service worker:
il primo caricamento e il reload richiedono la rete sul sito pubblico, oppure
il server locale durante lo sviluppo.

Il prototipo non esegue diagnosi, riabilitazione, valutazioni cliniche,
periodizzazione settimanale, deload automatici o ricalcolo della sessione gia
iniziata. Le restrizioni selezionabili sono esclusioni di movimenti, non
certificazioni di sicurezza. Non e un dispositivo medico.

Una sessione reale condivisa e un riferimento, non una prescrizione automatica
per tutti: non importiamo carichi, intensita o prestazioni personali come dati
dimostrativi. I limiti di volume sono euristiche conservative per livello e
durata; non misurano il recupero individuale. Per principianti il massimo resta
12 serie totali anche aumentando il tempo. Il motore non replica automaticamente
serie a RPE 9-10 e non introduce una logica di deload da una sola sessione.

Il carico non e inventato dal livello: senza storico viene scelto dall'utente.
Registrare il totale per un bilanciere, il peso di un singolo manubrio e la sola
zavorra per esercizi a corpo libero. Un valore mancante resta distinto da zero.
Tempi e RIR sono stime, non garanzie o misure cliniche. Interrompere un movimento
doloroso e rivolgersi a un professionista qualificato quando necessario.

## Struttura

| Modulo | Responsabilita |
|---|---|
| `src\domain.ts` | Catalogo, vincoli, generatore, tempi, sostituzioni, carichi |
| `src\storage.ts` | Schema locale, lettura protetta e backup |
| `src\App.tsx` | Navigazione, stato persistente e ciclo della sessione |
| `src\Configurator.tsx` | Input, priorita e preferenze |
| `src\Workout.tsx` | Editor, serie effettive e timer |
| `src\Screens.tsx` | Dashboard, catalogo, storico e progressi |
| `src\components.tsx` | Dialog accessibili e illustrazioni SVG originali |

## Comandi di sviluppo

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

I test unitari usano il runner integrato di Node.js. I test browser usano
Playwright con Google Chrome installato e coprono desktop e viewport mobile.
Il runner avvia il server locale se non e gia disponibile sulla porta 5173.

La toolchain usa Vite 7 e il relativo plugin React 5: in questo ambiente il
componente nativo di Rolldown richiesto da Vite 8 e bloccato da Windows.
Non e necessario disabilitare le protezioni del sistema.

Per visualizzare la build:

```powershell
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort
```
