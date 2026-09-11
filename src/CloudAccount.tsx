import { useState } from 'react'
import { Cloud, LogIn, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import type { CloudWorkspace } from './useCloudWorkspace'

export function CloudAccount({ workspace }: { workspace: CloudWorkspace }) {
  const [confirmation, setConfirmation] = useState<{ choice: 'local' | 'remote'; status: CloudWorkspace['status'] } | null>(null)
  const { identity, status } = workspace
  const confirm = confirmation?.status === status ? confirmation.choice : null
  const setConfirm = (choice: 'local' | 'remote' | null) => setConfirmation(choice ? { choice, status } : null)
  const working = workspace.busy || status.phase === 'saving'
  const blocked = working || Boolean(workspace.storageError)
  return <section className="cloud-account" aria-label="Account Google e sincronizzazione">
    <div className="cloud-account-heading"><Cloud size={22} /><div><h3>{identity ? identity.displayName || 'Il tuo account Google' : 'Porta i tuoi allenamenti con te'}</h3>
      <p>{identity?.email || 'Accesso Google facoltativo. Il browser resta utilizzabile anche senza account.'}</p></div></div>
    {workspace.accountChangePending ? <div className="cloud-confirm" role="alert">
      <strong>Proteggi questa copia prima del cambio account.</strong>
      <p>Le modifiche non salvate restano visibili qui. Scarica il backup prima di aprire lo spazio dell'account selezionato da Google.</p>
      <button className="button primary full" onClick={workspace.completeAccountChange}>Esporta copia e completa cambio account</button>
    </div> : !identity ? <>
      <p>Collega PC e telefono tramite Firebase. Prima di caricare i dati gia presenti su questo dispositivo ti chiederemo conferma.</p>
      <button className="button primary full" onClick={() => { void workspace.signIn() }} disabled={workspace.busy || !workspace.authReady || Boolean(workspace.storageError)}><LogIn size={18} /> {workspace.busy ? 'Preparazione accesso...' : 'Accedi con Google'}</button>
      {workspace.storageError && <p className="field-help">Prima di accedere, esporta il backup e risolvi il blocco di salvataggio. La copia in memoria non deve andare persa.</p>}
    </> : <>
      <p className={`cloud-state cloud-${status.phase}`} role="status">{status.message}</p>
      {(status.phase === 'choice' || status.phase === 'conflict') && <div className="cloud-choices">
        <p>Questa copia contiene <strong>{workspace.data.history.length} allenamenti salvati e {workspace.data.routines.length} routine</strong>{workspace.data.active ? ', con una sessione in corso' : ''}. I dati senza account restano separati.</p>
        <button className="button primary full" disabled={blocked} onClick={() => {
          if (status.canUseRemote) setConfirm('local')
          else void workspace.useLocal()
        }}>{status.canUseRemote ? 'Usa questa copia per il cloud' : 'Attiva sincronizzazione di questa copia'}</button>
        {status.canUseRemote && <button className="button secondary full" disabled={blocked} onClick={() => setConfirm('remote')}>Usa la copia Firebase</button>}
      </div>}
      {confirm && <div className="cloud-confirm" role="alert">
        <strong>{confirm === 'local' ? 'Sostituire la copia nel cloud?' : 'Caricare la copia del cloud su questo dispositivo?'}</strong>
        <p>{confirm === 'local'
          ? 'Verra scaricato un backup della copia cloud prima di sostituirla. Anche gli altri dispositivi riceveranno questa versione.'
          : 'Verra scaricato un backup dei dati correnti prima di sostituirli con quelli del tuo account.'} Se il cloud cambia nel frattempo, la sostituzione viene fermata.</p>
        <div className="cloud-actions"><button className="button secondary compact" disabled={blocked} onClick={() => setConfirm(null)}>Annulla</button>
          <button className="button primary compact" disabled={blocked} onClick={() => {
            const operation = confirm === 'local' ? workspace.useLocal() : workspace.useRemote()
            setConfirm(null)
            void operation
          }}>Esporta backup e conferma</button></div>
      </div>}
      <div className="cloud-actions">
        <button className="button secondary compact" onClick={workspace.retry} disabled={blocked || status.phase === 'connecting'}><RefreshCw size={16} /> Riprova sincronizzazione</button>
        <button className="button ghost compact" onClick={() => { void workspace.signOut() }} disabled={workspace.busy}><LogOut size={16} /> {workspace.storageError ? 'Esporta copia corrente ed esci' : 'Esci da Google'}</button>
      </div>
      <p className="field-help">Le modifiche non ancora inviate restano nella copia locale di questo account: riaccedi qui per completare la sincronizzazione. Uscire non le trasferisce a un altro account.</p>
    </>}
    {workspace.authError && <p className="alert" role="alert">{workspace.authError}</p>}
    {!workspace.authReady && !workspace.busy && !workspace.accountChangePending && <button className="button secondary compact" onClick={workspace.retry}>Riprova collegamento Google</button>}
    <p className="field-help"><ShieldCheck size={14} /> Lo spazio Firebase e accessibile solo al tuo account. Su dispositivi condivisi usa un profilo browser personale. Nessun allenamento viene inviato a un LLM.</p>
  </section>
}
