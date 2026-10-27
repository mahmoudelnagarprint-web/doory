import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorProvider } from '../../EditorProvider'
import { EditorEngine } from '../../engine/editor'
import { CutLineSection } from './cutline'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#222222"/></svg>'

async function renderSection() {
  const engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  await engine.insert.svgElement(SVG, 'test-element', 'Test element')
  render(
    <EditorProvider engine={engine} portalRoot={document.body}>
      <CutLineSection />
    </EditorProvider>,
  )
  return engine
}

describe('Cut line toolbar section', () => {
  let engine: EditorEngine | null = null

  afterEach(() => {
    engine?.dispose()
    engine = null
    document.body.innerHTML = ''
  })

  it('starts at a 2 mm bleed and sends the chosen offset to the engine', async () => {
    engine = await renderSection()
    const generate = vi.spyOn(engine.cutline, 'generate').mockResolvedValue(true)

    fireEvent.click(screen.getByTestId('ed-cutline'))
    const offset = await screen.findByLabelText('Bleed')
    expect(offset).toHaveValue('2')

    fireEvent.change(offset, { target: { value: '3.5' } })
    fireEvent.blur(offset)
    fireEvent.click(screen.getByTestId('ed-cutline-generate'))

    await waitFor(() => expect(generate).toHaveBeenCalledWith(3.5))
  })
})
