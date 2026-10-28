import { useEffect, useRef, useState } from 'react'
import { generateMockupWithDesign, type MockupTemplate } from './MockupPanel'
import styles from './MockupPanel.module.css'

export interface MockupRendererProps {
  template: MockupTemplate
  designImage: string
  fabricColor: string
  neonColor: string
  scale: number
}

export function MockupRenderer({ template, designImage, fabricColor, neonColor, scale }: MockupRendererProps) {
  const [svg, setSvg] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Initialize loading state in render phase (React-recommended pattern)
  if (!svg && !loading) {
    setLoading(true)
  }
  
  useEffect(() => {
    let active = true
    if (!active) return
    
    generateMockupWithDesign(template, designImage, fabricColor, neonColor)
      .then(result => {
        if (active) {
          setSvg(result)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    
    return () => { active = false }
  }, [template, designImage, fabricColor, neonColor])
  
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.transform = `scale(${scale})`
      containerRef.current.style.transformOrigin = 'center center'
    }
  }, [scale])
  
  if (loading) {
    return (
      <div className={styles.rendererLoading} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300, color: 'var(--ed-text-dim)', gap: 8 }}>
        <div className={styles.spinner} />
        <span>Rendering mockup...</span>
      </div>
    )
  }
  
  if (!svg) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300, color: 'var(--ed-text-dim)', gap: 8 }}>
        <span>Failed to render mockup</span>
      </div>
    )
  }
  
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        dangerouslySetInnerHTML={{ __html: svg }} 
        style={{ transformOrigin: 'center center', maxWidth: '100%', maxHeight: '100%' }}
      />
    </div>
  )
}