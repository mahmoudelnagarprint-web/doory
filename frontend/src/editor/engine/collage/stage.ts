/**
 * The Smart Collage Studio stage mode: what a drag on a photo does.
 *
 *  - `pan-photo`  the frame stays put and the picture moves inside it (the default).
 *  - `edit-frame` the picture and its frame move, resize and turn together, like any other object.
 *
 * The canvas reads it from the editor state, so the mode survives page switches and is part of the
 * same undo-free UI state as the grid and the guides.
 */
export type CollageStageMode = 'pan-photo' | 'edit-frame'
