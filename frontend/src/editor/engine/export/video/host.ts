import type { EditorEngine } from '../../editor'

export function hostOf(engine: EditorEngine): { loadContext: EditorEngine['loadContext']; loadSound: EditorEngine['audio']['sources']['load'] } {
  return { loadContext: engine.loadContext, loadSound: engine.audio.sources.load }
}
