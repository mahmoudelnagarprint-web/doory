import { audioStrings } from './strings'
/** Words for where a track plays, shared by the panel and the timeline. */
import type { AudioTrack } from '@/types/document'
/** "Whole design", "Page 3", or "Page removed" when the page the track belongs to is gone. */
export function scopeLabel(track: AudioTrack, pageIds: readonly string[]): string {
  if (track.scope.type === 'design') return audioStrings.tracks.scopes.design
  const pageId = track.scope.pageId
  const index = pageIds.indexOf(pageId)
  return index < 0 ? audioStrings.tracks.scopes.gone : audioStrings.tracks.scopes.page(index + 1)
}
