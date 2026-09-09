import { EXERCISE_MEDIA } from './exerciseMedia.generated.ts'

export interface ExerciseMedia {
  title: string
  invert: boolean
  frames: Array<{
    file: string
    url: string
    sourceUrl: string
    creator: string
    creatorUrl: string
    license: string
    licenseUrl: string
    changes: string
    original?: { name: string; url: string; license: string; licenseUrl: string; changes: string }
  }>
}

export function getExerciseMedia(exerciseId: string): ExerciseMedia | undefined {
  return Object.hasOwn(EXERCISE_MEDIA, exerciseId) ? EXERCISE_MEDIA[exerciseId] : undefined
}

export function mediaAssetUrl(file: string, base = import.meta.env.BASE_URL): string {
  return `${base}exercises/${file}`
}
