import { useEffect, useRef, useState } from 'react'
import { Activity, Dumbbell, ImageOff, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Exercise } from './domain'
import { getExerciseMedia, mediaAssetUrl } from './exerciseMedia'

export function Modal({ title, subtitle, children, onClose, wide = false }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement
    element?.showModal()
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      element?.close()
      document.body.style.overflow = oldOverflow
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])
  return <dialog ref={dialog} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby="modal-title"
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    } }}>
    <header className="modal-head"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <button className="icon-button" aria-label="Chiudi finestra" onClick={onClose}><X size={20} /></button>
    </header>
    {children}
  </dialog>
}

export function ExerciseArtwork({ exercise, pattern = '', small = false }: { exercise?: Exercise; pattern?: string; small?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  const media = exercise ? getExerciseMedia(exercise.id) : undefined
  const frame = media?.frames[0]
  if (frame && failed !== frame.file) return <div className={`exercise-art has-illustration ${small ? 'art-small' : ''}`} aria-hidden="true">
    <img src={mediaAssetUrl(frame.file)} alt="" loading="lazy" decoding="async" width="96" height="96"
      className={media?.invert ? 'media-inverted' : ''} onError={() => setFailed(frame.file)} />
  </div>
  if (exercise) return <div className={`exercise-art ${small ? 'art-small' : ''}`} aria-hidden="true" title={frame ? 'Illustrazione non caricata' : 'Illustrazione non disponibile per questa variante'}><ImageOff size={small ? 23 : 30} strokeWidth={1.4} /></div>
  const leg = /squat|hinge|leg|lunge|glute/.test(pattern)
  const core = /core|plank|rotation/.test(pattern)
  return <div className={`exercise-art ${leg ? 'art-purple' : core ? 'art-peach' : ''} ${small ? 'art-small' : ''}`} aria-hidden="true">
    {core ? <Activity size={small ? 23 : 36} strokeWidth={1.4} /> : <Dumbbell size={small ? 23 : 36} strokeWidth={1.4} style={{ transform: leg ? 'rotate(-35deg)' : 'rotate(-15deg)' }} />}
  </div>
}

export function ExerciseIllustration({ exercise }: { exercise: Exercise }) {
  const [selected, setSelected] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const media = getExerciseMedia(exercise.id)
  const frame = media?.frames[selected]
  if (!media || !frame) return <div className="media-unavailable"><ImageOff size={32} /><strong>Illustrazione non disponibile per questa variante.</strong><p>Non mostriamo un esercizio simile al suo posto. Usa il nome originale e le indicazioni della scheda per identificarlo.</p></div>
  return <figure className="exercise-illustration">
    <div className="media-frame">
      {failed === frame.file ? <div className="media-unavailable" role="alert"><ImageOff size={32} /><strong>Impossibile caricare l'illustrazione.</strong><p>Controlla la connessione e riprova.</p><button className="button secondary compact" onClick={() => setFailed(null)}>Riprova</button></div>
        : <img src={mediaAssetUrl(frame.file)} alt={`Illustrazione di ${exercise.name}, immagine ${selected + 1}`} width="512" height="512"
          className={media.invert ? 'media-inverted' : ''} onError={() => setFailed(frame.file)} />}
    </div>
    {media.frames.length > 1 && <div className="media-positions" role="group" aria-label="Immagini dell'esercizio">{media.frames.map((item, index) =>
      <button key={item.file} className={`chip ${selected === index ? 'selected' : ''}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>Immagine {index + 1}</button>)}</div>}
    <figcaption><p>Riferimento visivo per riconoscere l'esercizio, non una dimostrazione completa della tecnica.</p>
      <details className="media-credits"><summary>Fonte e licenza</summary>
        <p><a href={frame.sourceUrl} target="_blank" rel="noreferrer">{media.title}</a> di <a href={frame.creatorUrl} target="_blank" rel="noreferrer">{frame.creator}</a>. <a href={frame.licenseUrl} target="_blank" rel="noreferrer">{frame.license}</a>.</p>
        {frame.original && <p>Derivato da <a href={frame.original.url} target="_blank" rel="noreferrer">{frame.original.name}</a> ({frame.original.license}). {frame.original.changes}</p>}
        <p>{frame.changes}</p>
      </details>
    </figcaption>
  </figure>
}

export function HeroArtwork() {
  return <svg className="hero-art" viewBox="0 0 370 290" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="plate" x1="70" y1="45" x2="270" y2="260" gradientUnits="userSpaceOnUse"><stop stopColor="#b4d86e"/><stop offset="1" stopColor="#3c502c"/></linearGradient>
      <linearGradient id="metal" x1="90" y1="90" x2="255" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#dce7d0"/><stop offset=".45" stopColor="#6c7964"/><stop offset="1" stopColor="#c2d1b6"/></linearGradient>
    </defs>
    <circle cx="197" cy="142" r="116" stroke="#d0f58a" strokeOpacity=".1"/>
    <circle cx="197" cy="142" r="91" stroke="#d0f58a" strokeOpacity=".09" strokeDasharray="3 8"/>
    <path d="M43 204C82 254 277 268 326 115" stroke="#d0f58a" strokeOpacity=".22"/>
    <g transform="translate(38 17) rotate(-32 150 120)">
      <rect x="30" y="107" width="260" height="26" rx="10" fill="url(#metal)"/>
      <rect x="61" y="64" width="35" height="114" rx="15" fill="#24301e" stroke="#7e9c52"/>
      <rect x="78" y="48" width="39" height="146" rx="17" fill="url(#plate)" stroke="#c5e995"/>
      <ellipse cx="117" cy="121" rx="22" ry="72" fill="#526b36" stroke="#a6c978"/>
      <ellipse cx="117" cy="121" rx="14" ry="50" stroke="#b1d481" strokeOpacity=".45"/>
      <rect x="115" y="110" width="85" height="21" rx="3" fill="url(#metal)"/>
      <path d="M134 112v17m5-17v17m5-17v17m5-17v17m5-17v17m5-17v17m5-17v17m5-17v17m5-17v17m5-17v17" stroke="#45503e" strokeWidth="1.5"/>
      <rect x="198" y="48" width="39" height="146" rx="17" fill="url(#plate)" stroke="#c5e995"/>
      <ellipse cx="237" cy="121" rx="22" ry="72" fill="#354729" stroke="#8dab66"/>
      <ellipse cx="237" cy="121" rx="14" ry="50" stroke="#759354"/>
      <rect x="235" y="64" width="22" height="114" rx="12" fill="#536e38" stroke="#a2c571"/>
      <ellipse cx="258" cy="121" rx="14" ry="57" fill="#283622" stroke="#85a35f"/>
      <ellipse cx="258" cy="121" rx="8" ry="29" stroke="#566e3e"/>
      <rect x="255" y="110" width="24" height="22" rx="6" fill="url(#metal)"/>
    </g>
    <path d="M294 51v14m-7-7h14M78 219v10m-5-5h10" stroke="#d0f58a" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="303" cy="206" r="4" fill="#d0f58a"/><circle cx="67" cy="77" r="3" fill="#d0f58a" fillOpacity=".6"/>
  </svg>
}
