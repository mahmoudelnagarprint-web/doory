import { Blend, Box, Clapperboard, Images, LayoutGrid, LayoutTemplate, Layers, Music, PaintBucket, Palette, PanelsTopLeft, Shapes, Sparkles, Sticker, Type } from 'lucide-react'
import { ImageDrawer } from '../drawers/ImageDrawer'
import { ShapesDrawer } from '../drawers/ShapesDrawer'
import { TextDrawer } from '../drawers/TextDrawer'
import { BackgroundPanel } from '../panels/BackgroundPanel'
import { CommentsButtonIcon } from '../panels/CommentsButtonIcon'
import { LayersPanel } from '../panels/LayersPanel'
import { registerPanel } from '../panels/registry'
import { loadable } from '../ui/loadable'
import { LazyCommentPins } from '../workspace/CommentPinsLoader'

// Tools that most sessions never open live in chunks of their own: the rail entry starts
// the download when it is hovered or focused, so the panel is usually there by the time it is clicked.
const TemplatesPanel = loadable(() => import('../panels/TemplatesPanel').then((m) => m.TemplatesPanel))
const BrandPanel = loadable(() => import('../panels/BrandPanel').then((m) => m.BrandPanel))
const AnimatePanel = loadable(() => import('../panels/AnimatePanel').then((m) => m.AnimatePanel))
const AudioPanel = loadable(() => import('../panels/AudioPanel').then((m) => m.AudioPanel))
const VideosPanel = loadable(() => import('../panels/VideosPanel').then((m) => m.VideosPanel))
const CommentsPanel = loadable(() => import('../panels/CommentsPanel').then((m) => m.CommentsPanel))
const ElementsPanel = loadable(() => import('../panels/elements/ElementsPanel').then((m) => m.ElementsPanel))
const StickersPanel = loadable(() => import('../panels/elements/StickersPanel').then((m) => m.StickersPanel))
const AssetLibraryPanel = loadable(() => import('../panels/AssetLibraryPanel').then((m) => m.AssetLibraryPanel))
const CollagePanel = loadable(() => import('../panels/CollagePanel').then((m) => m.CollagePanel))
const BackgroundTextPanel = loadable(() => import('../panels/BackgroundTextPanel').then((m) => m.BackgroundTextPanel))
const MockupPanel = loadable(() => import('../panels/mockups/MockupPanel').then((m) => m.MockupPanel))

/** Rail icons: lucide at 20 px, so the rail reads as one set. */
const icon = (Glyph: typeof Type) => <Glyph size={20} strokeWidth={1.8} aria-hidden="true" />

/**
 * The tools of the rail, most used first: Templates, Text, Shapes, Elements and Assets, then the rest. Every tool docks beside the rail
 * on desktop (a bottom sheet on small screens); Text, Images, Shapes and Background are `drawer` tools, whose content scrolls as one column
 * and stays open while things are added from it. Comments is an icon at the right end of the top bar.
 */
export function registerBuiltinPanels(): void {
  const editable = ({ state }: { state: { readOnly: boolean } }): boolean => !state.readOnly
  registerPanel({ id: 'templates', label: 'Templates', icon: icon(LayoutTemplate), order: 5, placement: 'sidebar', component: TemplatesPanel, preload: TemplatesPanel.preload, requires: editable })
  registerPanel({ id: 'text', label: 'Text', icon: icon(Type), order: 10, placement: 'drawer', component: TextDrawer, requires: editable, shortcut: 'T' })
  registerPanel({ id: 'shapes', label: 'Shapes', icon: icon(Shapes), order: 20, placement: 'drawer', component: ShapesDrawer, requires: editable })
  registerPanel({ id: 'stickers', label: 'Stickers', title: 'Stickers', icon: icon(Sticker), order: 25, placement: 'sidebar', width: 360, component: StickersPanel, preload: StickersPanel.preload, requires: editable })
  registerPanel({ id: 'elements', label: 'Elements', title: 'Elements', icon: icon(Shapes), order: 30, placement: 'sidebar', width: 360, component: ElementsPanel, preload: ElementsPanel.preload, requires: editable })
  registerPanel({ id: 'assets', label: 'Assets', title: 'Asset library', icon: icon(LayoutGrid), order: 35, placement: 'sidebar', width: 360, component: AssetLibraryPanel, preload: AssetLibraryPanel.preload, requires: editable })
  registerPanel({ id: 'collage', label: 'Collage', title: 'Collage studio', icon: icon(PanelsTopLeft), order: 37, placement: 'sidebar', width: 370, component: CollagePanel, preload: CollagePanel.preload, requires: editable })
  registerPanel({ id: 'image', label: 'Images', icon: icon(Images), order: 40, placement: 'drawer', component: ImageDrawer, requires: editable })
  registerPanel({ id: 'videos', label: 'Videos', icon: icon(Clapperboard), order: 45, placement: 'drawer', component: VideosPanel, preload: VideosPanel.preload, requires: editable })
  registerPanel({ id: 'background', label: 'Background', icon: icon(PaintBucket), order: 60, placement: 'drawer', component: BackgroundPanel, requires: editable })
  registerPanel({ id: 'background-text', label: 'Background & Text', title: 'Background, Gradients, Colors, Fonts & Text Effects', icon: <Blend size={20} strokeWidth={1.8} aria-hidden="true" />, order: 65, placement: 'sidebar', width: 400, component: BackgroundTextPanel, preload: BackgroundTextPanel.preload, requires: editable })
  registerPanel({ id: 'mockups', label: 'Mockups', title: 'Product Mockup Studio', icon: <Box size={20} strokeWidth={1.8} aria-hidden="true" />, order: 67, placement: 'sidebar', width: 420, component: MockupPanel, preload: MockupPanel.preload, requires: editable })
  registerPanel({ id: 'brand', label: 'Brand', icon: icon(Palette), order: 70, placement: 'sidebar', component: BrandPanel, preload: BrandPanel.preload, requires: ({ state }) => !state.readOnly && state.mode !== 'shared-edit' })
  registerPanel({ id: 'animate', label: 'Animate', title: 'Animate', icon: icon(Sparkles), order: 75, placement: 'sidebar', component: AnimatePanel, preload: AnimatePanel.preload, requires: editable })
  registerPanel({ id: 'audio', label: 'Audio', title: 'Audio', icon: icon(Music), order: 76, placement: 'sidebar', component: AudioPanel, preload: AudioPanel.preload, readOnly: true })
  registerPanel({ id: 'layers', label: 'Layers', icon: icon(Layers), order: 80, placement: 'sidebar', component: LayersPanel, readOnly: true })
  registerPanel({
    id: 'comments',
    label: 'Comments',
    icon: <CommentsButtonIcon />,
    order: 90,
    placement: 'sidebar',
    slot: 'end',
    readOnly: true,
    component: CommentsPanel,
    preload: () => void Promise.all([CommentsPanel.preload(), LazyCommentPins.preload()]),
    requires: ({ editor, state }) => state.mode !== 'shared-view' && (!!editor.adapter.services.comments || state.mode === 'shared-comment'),
  })
}

registerBuiltinPanels()
