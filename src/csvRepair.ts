import { needsCsvRepair } from './domain.ts'
import type { WorkoutSession } from './domain.ts'
import type { AppData } from './storage.ts'

export type CsvRepairResult =
  | { error: string; data: null }
  | { error: null; data: AppData; correctedSessions: number; restoredSets: number; remainingSessions: number }

function signature(session: WorkoutSession): string {
  return JSON.stringify([session.plan.name, session.startedAt, session.finishedAt])
}

export function repairCsvHistory(current: AppData, source: WorkoutSession[]): CsvRepairResult {
  const candidates = new Map<string, WorkoutSession[]>()
  for (const session of source) {
    if (session.importSource?.mappingVersion !== 2) return { error: 'Serve il CSV originale letto con il nuovo importatore.', data: null }
    const key = signature(session)
    candidates.set(key, [...(candidates.get(key) ?? []), session])
  }
  const used = new Set<string>()
  const replacements = new Map<WorkoutSession, WorkoutSession>()
  for (const old of current.history.filter(needsCsvRepair)) {
    const matches = candidates.get(signature(old)) ?? []
    if (!matches.length) continue
    const replacement = matches[0]
    const sourceKey = replacement.importSource!.key
    if (matches.length !== 1 || used.has(sourceKey)
      || current.history.some((session) => session.importSource?.key === sourceKey)) {
      return { error: 'Il CSV contiene corrispondenze ambigue o sedute gia importate. Nessun dato e stato modificato.', data: null }
    }
    if (replacement.logs.length < old.logs.length) {
      return { error: 'Il CSV contiene meno serie di una seduta salvata. Seleziona un export completo: nessun dato e stato modificato.', data: null }
    }
    used.add(sourceKey)
    replacements.set(old, { ...replacement, id: old.id })
  }
  if (!replacements.size) return { error: 'Nessuna vecchia seduta corrisponde al CSV. Seleziona il file originale, nello stesso fuso orario usato per importarlo. Nessun dato e stato modificato.', data: null }
  const history = current.history.map((session) => replacements.get(session) ?? session)
  return {
    error: null, data: { ...current, history }, correctedSessions: replacements.size,
    restoredSets: [...replacements.values()].reduce((sum, session) => sum + session.logs.length, 0),
    remainingSessions: history.filter(needsCsvRepair).length,
  }
}
