# TempoFit

Prototipo web mobile-first per pianificare e registrare allenamenti di forza e
ipertrofia in base al tempo disponibile. Interfaccia originale ispirata alla
semplicita dei workout tracker, senza utilizzare marchi, schermate o asset Hevy.

## Sito pubblico

<https://gianmarcotacchini92.github.io/tempofit/>

Il sito funziona senza server locale, con accesso Google facoltativo e
sincronizzazione Firebase. La pubblicazione del codice non pubblica lo storico
personale. Senza account i dati rimangono nel browser, separati per indirizzo.
Per trasferirli da un'altra origine si puo collegare lo stesso account Google
oppure esportare un backup JSON e importarlo in un archivio vuoto.

## Account Google e sincronizzazione

Aprire **Il tuo profilo**, oppure il pulsante del profilo in alto a destra,
e scegliere **Accedi con Google**. Il progetto Firebase condiviso e `sincro-ai`;
lo spazio TempoFit e separato dagli altri progetti e dagli altri utenti.

Al primo collegamento, una copia locale con allenamenti, piano, sessione
o impostazioni personalizzate non viene caricata automaticamente. Scegliere
**Attiva sincronizzazione di questa copia** se il cloud e vuoto; se contiene
gia dati, scegliere esplicitamente quale copia utilizzare. Prima di una
sostituzione viene scaricato un backup della copia sostituita. Non chiudere
la pagina prima che compaia **Sincronizzato**.

Con lo stesso account su un secondo dispositivo vuoto, la copia Firebase
viene recuperata automaticamente. Si sincronizzano storico, serie, carichi,
impostazioni, piano, sessione attiva e scadenza del timer. Aggiunte indipendenti
allo storico si uniscono; modifiche concorrenti della stessa seduta o della
sessione in corso richiedono una scelta, senza sovrascrittura automatica.
Il timer scade allo stesso istante sui dispositivi: non riparte dalla durata
iniziale.

Una pagina gia caricata continua a salvare localmente senza rete. Al ritorno
della connessione rilegge prima il cloud e poi riconcilia le modifiche. Ogni
account ha una copia browser distinta; uscire ripristina lo spazio senza account,
non trasferisce i dati al prossimo utente e non cancella modifiche pendenti.
Per inviarle, riaccedere allo stesso account nello stesso browser. In caso di
salvataggio locale bloccato, il pulsante di uscita esporta prima la copia corrente.
Le copie locali non sono cifrate: su un dispositivo condiviso usare un profilo
browser personale. L'autorizzazione Firebase protegge l'accesso al cloud, non
la memoria di un browser gia accessibile.

Un errore di salvataggio blocca l'accesso iniziale finche non si protegge la
copia in memoria. Se Google cambia account da un'altra scheda durante il blocco,
il passaggio viene sospeso: **Esporta copia e completa cambio account** conserva
prima un backup. Anche le importazioni ancora in lettura vengono annullate se
nel frattempo il cloud o un'altra scheda modificano l'archivio.

La sincronizzazione non sostituisce il backup JSON. Il ripristino dell'archivio
senza account e disponibile dopo l'uscita e non elimina i dati Firebase.

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
  convertito in una stima RIR conservativa. Le identita degli esercizi sono
  esatte: macchine, bilancieri, inclinazioni, prese e varianti unilaterali
  non condividono carichi o grafici. Nome originale, indice della serie e
  provenienza del CSV restano nel backup. Nessuna serie viene tagliata per
  accorpare esercizi diversi. Attivita non supportate (anche Wall Sit) sono
  segnalate, mai convertite in un altro movimento.
- Le varianti aggiunte per riconoscere gli export sono disponibili nello
  storico, nei progressi e nella libreria; non ampliano automaticamente il
  catalogo usato dal generatore. Le istruzioni indicano questa distinzione.
- Correzione degli import precedenti: dal profilo scegliere **Correggi storico
  dal CSV originale**, selezionare lo stesso file, esportare il backup e
  confermare l'anteprima. Si sostituiscono solo le vecchie sedute CSV con
  titolo, inizio e fine corrispondenti, senza aggiungerne di nuove o toccare
  sessioni native, impostazioni, piano e sessione in corso. Corrispondenze
  ambigue sono bloccate; sedute mancanti nel file rimangono da correggere.
  Il vecchio import aveva perso i nomi originali: non e possibile recuperare
  la variante corretta senza il CSV, ne tramite una semplice rinomina.
- Illustrazioni didattiche con miniature e scheda ingrandita da libreria,
  piano, sessione, storico e progressi. Quando sono disponibili due immagini
  si possono alternare manualmente. Le associazioni visive sono esplicite
  per variante: nessuna immagine viene ereditata da un esercizio simile e
  le vecchie associazioni CSV da correggere non mostrano immagini fuorvianti.
  Le varianti senza illustrazione e gli errori di caricamento sono segnalati.

## Tecniche per ottimizzare il tempo

Nel configuratore, **Ottimizza il tempo** e facoltativo e disattivato per
impostazione predefinita. Sulle sedute brevi il generatore puo proporre
tecniche compatibili, senza applicarle ai fondamentali pesanti del focus:
drop set (stripping), rest-pause e superserie. Principianti e programmi di
sola forza mantengono serie tradizionali. Le tecniche non vengono forzate
quando attrezzatura, movimento o budget non le rendono appropriate.

Drop e rest-pause prevedono una sola mini-serie dopo l'ultima serie
principale: carico ridotto di circa il 20-25% nel drop, stesso carico nel
rest-pause. Il piano indica ripetizioni, RIR e breve pausa/cambio del
carico. Le mini-serie non sono considerate equivalenti a serie complete.
Le superserie alternano due esercizi adiacenti compatibili, A1/B1/A2/B2,
con tempo di cambio attrezzo e recupero tra i giri. Occorre avere gli
attrezzi vicini e disponibili; in caso contrario si puo sciogliere la
coppia dall'editor.

La matita di un esercizio consente di cambiare tecnica o abbinamento.
Sostituire o rimuovere un componente, oppure cambiarne il numero di serie,
scioglie la coppia. Il tempo totale viene ricalcolato e un piano fuori
budget non puo essere avviato. Le modifiche non riscrivono lo storico.

Carico, ripetizioni e RIR della mini-serie sono registrati separatamente.
Il timer segue il passaggio effettivo; sessione e timer riprendono dopo
un ricaricamento. Annullare la serie principale annulla anche la sua
mini-serie. Nel grafico il volume resta separato per ciascun carico;
le mini-serie sono escluse dal massimale stimato e dalla progressione
dei carichi tradizionale. Il conteggio delle serie complete e la
distribuzione muscolare non sommano le mini-serie come serie intere.

I dati aggiungono campi opzionali (`optimizeTime`, `technique`,
`supersetGroup`, `part`) senza cambiare la chiave locale o il formato
dei vecchi CSV. Backup e sessioni preesistenti restano leggibili.

## Illustrazioni e licenze

Le immagini provengono da [Everkinetic / Greg Priday](https://github.com/everkinetic/data)
e da [Workout Guide / Bryl Lim](https://github.com/bryllim/workout-guide).
Sono distribuite sotto **CC BY-SA 4.0**, con sorgente, autore, licenza e
modifiche preesistenti indicati in ogni scheda e nel file pubblico
`public\exercises\ATTRIBUTION.json`. La licenza degli asset non viene estesa
implicitamente al codice dell'app. Non sono immagini di Hevy.

Gli asset sono serviti dallo stesso sito: nessuna richiesta a un catalogo
esterno durante l'uso e nessun invio dei dati di allenamento. I file originali
sono copiati senza modifiche; solo le immagini bianche di Workout Guide
vengono invertite via CSS per essere leggibili sul fondo chiaro. Le posizioni
sono riferimenti per identificare l'esercizio, non animazioni o istruzioni
tecniche complete.

`src\exerciseMediaSources.ts` contiene le associazioni deliberate e i commit
delle fonti. `npm.cmd run media:sync` scarica i file selezionati, la licenza
e genera `src\exerciseMedia.generated.ts` e i crediti. Questo comando serve
solo per aggiornare gli asset: build e deploy normali non dipendono dai
cataloghi esterni. Non assegnare immagini a nuove varianti senza controllarne
attrezzatura, posizione e contenuto effettivo.

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
L'accesso Google e facoltativo; non vengono effettuate chiamate a un LLM.
Lo storico iniziale e vuoto: nessuna prestazione dimostrativa viene mescolata
con i dati dell'utente.

Il salvataggio e specifico del browser e dell'origine: `localhost` e `127.0.0.1`,
cosi come porte differenti, hanno archivi separati. Cancellare i dati del sito elimina la copia locale e le modifiche non ancora
sincronizzate, non la copia gia pubblicata nel proprio account Firebase.
Esportare periodicamente un backup dal profilo.
L'importazione JSON o CSV richiede un archivio vuoto per evitare sovrascritture,
eccetto la procedura guidata di correzione dei vecchi import CSV. Fino alla
correzione queste sedute restano esportabili e consultabili con un avviso,
ma non alimentano grafici per esercizio, distribuzione muscolare o suggerimenti
di carico. I piani gia generati restano invariati: ricontrollarne i carichi.
Modifiche rilevate da un'altra scheda bloccano le nuove scritture finche non si
ricarica la pagina. Dati corrotti non vengono sovrascritti automaticamente.

Gli asset grafici e i font DM Sans e Manrope sono inclusi localmente.
Accesso e sincronizzazione usano Google Authentication e Cloud Firestore.
Nessun archivio viene inviato prima del collegamento esplicito.
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
| `src\accountStorage.ts` | Copie browser separate per account, controlli e baseline compatta |
| `src\useCloudWorkspace.ts` | Cambio account, persistenza locale e integrazione React |
| `src\cloudModel.ts` / `src\cloudSync.ts` | Merge a tre vie, conflitti, retry e protezione da risposte obsolete |
| `src\cloudPayload.ts` / `src\firebaseClient.ts` | Manifesto, sedute immutabili, Google Auth e transazioni Firestore |
| `src\App.tsx` | Navigazione, stato persistente e ciclo della sessione |
| `src\Configurator.tsx` | Input, priorita e preferenze |
| `src\Workout.tsx` | Editor, serie effettive e timer |
| `src\Screens.tsx` | Dashboard, catalogo, storico e progressi |
| `src\components.tsx` | Dialog accessibili e illustrazioni SVG originali |

### Archiviazione Firebase

La configurazione browser pubblica e in `src\firebaseConfig.ts`: non contiene
chiavi amministrative. L'accesso ai dati dipende dalle regole Firebase, non
dalla segretezza della configurazione web.

Il manifesto `/tempoFitUsers/{uid}` contiene configurazione, revisione e lista
dei documenti delle sedute. Ogni seduta e un documento immutabile
`/tempoFitUsers/{uid}/sessions/{sha256}`. Questo evita il limite di 1 MiB per
un unico archivio, gia insufficiente per lo storico importato. Si inviano solo
le sedute nuove o modificate, poi una transazione pubblica il manifesto solo
se la revisione attesa e ancora corrente. I documenti non referenziati non
vengono letti come allenamenti; non e prevista cancellazione automatica.
Il client impone 900 KiB per documento e 5.000 sedute per manifesto. Limiti
di spazio browser e quote Firestore vengono segnalati, senza tagliare lo storico.

Le regole in `firebase\tempofit.rules.fragment` sono un **frammento**, non
l'intero ruleset del progetto condiviso. Non distribuirle da sole con
`firebase deploy`: cancellerebbero le regole delle altre applicazioni.
Usare il helper `scripts\deploy-firebase-rules.mjs`, che conserva il ruleset
esistente, controlla gli accessi e richiede l'applicazione esplicita.
Non registrare nei commit credenziali Firebase CLI, token OAuth o regole
private degli altri progetti.

Il helper richiede Firebase CLI **15.29.0** gia autenticata e disponibile nella
cache npm. Non cambia account o autorizzazioni degli altri progetti.

```powershell
npm.cmd exec --offline --package=firebase-tools -- node scripts\deploy-firebase-rules.mjs --dry-run
npm.cmd exec --offline --package=firebase-tools -- node scripts\deploy-firebase-rules.mjs --apply
```

Il dry-run non pubblica regole. Apply esegue nuovamente i controlli, conserva
le regole esistenti e si ferma se la release cambia durante la preparazione.
L'API Firebase non offre un aggiornamento condizionale atomico delle release:
coordinare quindi eventuali deploy contemporanei delle altre applicazioni.

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
