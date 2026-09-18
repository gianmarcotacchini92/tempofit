import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as NavigatorWithStandalone).standalone === true
}

function isAppleMobile(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isInstalled)

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault()
      setPromptEvent(event as InstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install(): Promise<string> {
    if (installed) return 'TempoFit e gia installata.'
    if (!promptEvent) {
      return isAppleMobile()
        ? 'Su iPhone: apri Condividi in Safari, poi scegli Aggiungi alla schermata Home.'
        : 'Apri il menu del browser e scegli Installa app o Aggiungi alla schermata Home.'
    }
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    setPromptEvent(null)
    return choice.outcome === 'accepted' ? 'Installazione di TempoFit avviata.' : 'Installazione annullata.'
  }

  return { installed, install }
}
