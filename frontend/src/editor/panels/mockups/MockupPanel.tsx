/**
 * Product Mockup Studio — Interactive Mockup Panel
 * 12+ realistic SVG/Canvas composite product templates with
 * "Map Current Canvas Design onto Mockup" functionality
 */
import { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react'
import { Download, Maximize, Minimize, Wand2, Layers, Box, Shirt, Coffee, Smartphone, Pill, Frame, Zap, Sparkles } from 'lucide-react'
import { useEditor } from '../../context'
import { renderPageToCanvas } from '../../engine/render'
import { getPageSize } from '../../engine/pageSizes'
import styles from './MockupPanel.module.css'

// Lazy-load heavy mockup renderer
const MockupRenderer = lazy(() => import('./MockupRenderer').then(m => ({ default: m.MockupRenderer })))

export interface MockupTemplate {
  id: string
  name: string
  category: 'apparel' | 'merch' | 'home' | 'laser' | 'tech'
  icon: React.ReactNode
  // SVG template with placeholder region marked by data-mockup-area
  templateSvg: string
  // Normalized coordinates of the printable area (0-1)
  printableArea: { x: number; y: number; width: number; height: number; rotation?: number }
  // Default fabric/product color
  defaultColor?: string
  // Available fabric colors
  fabricColors?: string[]
  // Export dimensions
  exportWidth: number
  exportHeight: number
  // Description
  description: string
}

const MOCKUP_TEMPLATES: MockupTemplate[] = [
  // APPAREL
  {
    id: 'tshirt-front',
    name: 'T-Shirt Front',
    category: 'apparel',
    icon: <Shirt size={16} />,
    templateSvg: generateTShirtTemplate(false),
    printableArea: { x: 0.2, y: 0.18, width: 0.6, height: 0.65 },
    defaultColor: '#1a1a2e',
    fabricColors: ['#1a1a2e', '#ffffff', '#f5f5f5', '#e8e8e8', '#2d2d2d', '#1e3a5f', '#2d4a3d', '#4a1a1a', '#1a3a2e', '#3a1a3a'],
    exportWidth: 2400,
    exportHeight: 3200,
    description: 'Front print on crew neck T-shirt'
  },
  {
    id: 'tshirt-back',
    name: 'T-Shirt Back',
    category: 'apparel',
    icon: <Shirt size={16} />,
    templateSvg: generateTShirtTemplate(true),
    printableArea: { x: 0.2, y: 0.15, width: 0.6, height: 0.7 },
    defaultColor: '#1a1a2e',
    fabricColors: ['#1a1a2e', '#ffffff', '#f5f5f5', '#e8e8e8', '#2d2d2d', '#1e3a5f', '#2d4a3d', '#4a1a1a'],
    exportWidth: 2400,
    exportHeight: 3200,
    description: 'Back print on crew neck T-shirt'
  },
  {
    id: 'hoodie-front',
    name: 'Hoodie Front',
    category: 'apparel',
    icon: <Shirt size={16} />,
    templateSvg: generateHoodieTemplate(),
    printableArea: { x: 0.22, y: 0.25, width: 0.56, height: 0.5 },
    defaultColor: '#1a1a2e',
    fabricColors: ['#1a1a2e', '#2d2d2d', '#1e3a5f', '#2d4a3d', '#4a1a1a', '#3a3a3a'],
    exportWidth: 2400,
    exportHeight: 3200,
    description: 'Front print on pullover hoodie (avoid pocket area)'
  },
  {
    id: 'tote-bag',
    name: 'Tote Bag',
    category: 'apparel',
    icon: <Box size={16} />,
    templateSvg: generateToteBagTemplate(),
    printableArea: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
    defaultColor: '#f5f0e1',
    fabricColors: ['#f5f0e1', '#ffffff', '#1a1a2e', '#e8e8e8', '#d4c4a8'],
    exportWidth: 2400,
    exportHeight: 2400,
    description: 'Full-print canvas tote bag'
  },
  
  // MERCH
  {
    id: 'ceramic-mug',
    name: 'Ceramic Mug',
    category: 'merch',
    icon: <Coffee size={16} />,
    templateSvg: generateMugTemplate(),
    printableArea: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 },
    defaultColor: '#ffffff',
    fabricColors: ['#ffffff', '#f5f5f5', '#1a1a2e'],
    exportWidth: 3000,
    exportHeight: 1125,
    description: '11oz ceramic mug wrap-around'
  },
  {
    id: 'phone-case',
    name: 'Phone Case',
    category: 'merch',
    icon: <Smartphone size={16} />,
    templateSvg: generatePhoneCaseTemplate(),
    printableArea: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
    defaultColor: '#1a1a2e',
    fabricColors: ['#1a1a2e', '#ffffff', '#f5f5f5', '#e8e8e8', '#ff6b6b', '#4ecdc4', '#ffe66d'],
    exportWidth: 2400,
    exportHeight: 4800,
    description: 'Full-wrap phone case (iPhone template)'
  },
  {
    id: 'throw-pillow',
    name: 'Throw Pillow',
    category: 'merch',
    icon: <Pill size={16} />,
    templateSvg: generatePillowTemplate(),
    printableArea: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    defaultColor: '#ffffff',
    fabricColors: ['#ffffff', '#f5f0e1', '#e8e8e8', '#d4c4a8'],
    exportWidth: 2400,
    exportHeight: 2400,
    description: '16x16 inch throw pillow'
  },
  {
    id: 'poster-frame',
    name: 'Poster Frame on Wall',
    category: 'home',
    icon: <Frame size={16} />,
    templateSvg: generatePosterFrameTemplate(),
    printableArea: { x: 0.18, y: 0.18, width: 0.64, height: 0.64 },
    defaultColor: '#1a1a2e',
    fabricColors: ['#1a1a2e', '#2d2d2d', '#ffffff', '#f5f0e1'],
    exportWidth: 2400,
    exportHeight: 2400,
    description: 'Framed poster in modern interior'
  },
  {
    id: 'business-cards',
    name: 'Business Card Stack',
    category: 'merch',
    icon: <Layers size={16} />,
    templateSvg: generateBusinessCardsTemplate(),
    printableArea: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    defaultColor: '#ffffff',
    fabricColors: ['#ffffff', '#f5f0e1', '#1a1a2e'],
    exportWidth: 2400,
    exportHeight: 1500,
    description: 'Stack of business cards in perspective'
  },
  
  // LASER / WORKSHOP
  {
    id: 'wood-plaque',
    name: 'Engraved Wood Plaque',
    category: 'laser',
    icon: <Box size={16} />,
    templateSvg: generateWoodPlaqueTemplate(),
    printableArea: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    defaultColor: '#8b6914',
    fabricColors: ['#8b6914', '#a0522d', '#cd853f', '#d2691e', '#deb887', '#f5f0e1'],
    exportWidth: 2400,
    exportHeight: 1200,
    description: 'Laser-engraved wood desk plaque'
  },
  {
    id: 'acrylic-night-light',
    name: 'Acrylic LED Night Light',
    category: 'laser',
    icon: <Zap size={16} />,
    templateSvg: generateAcrylicNightLightTemplate(),
    printableArea: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 },
    defaultColor: '#ffffff',
    fabricColors: ['#ffffff', '#f0f0f0'],
    exportWidth: 2400,
    exportHeight: 2400,
    description: 'Acrylic insert for LED base with neon glow effect'
  },
  {
    id: 'wall-clock',
    name: 'Wall Clock',
    category: 'home',
    icon: <Sparkles size={16} />,
    templateSvg: generateWallClockTemplate(),
    printableArea: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    defaultColor: '#ffffff',
    fabricColors: ['#ffffff', '#f5f0e1', '#1a1a2e', '#2d2d2d'],
    exportWidth: 2400,
    exportHeight: 2400,
    description: '12-inch wall clock face'
  },
]

// ============================================
// SVG TEMPLATE GENERATORS
// ============================================

function generateTShirtTemplate(isBack: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
  <defs>
    <filter id="fabric-texture">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" result="noise"/>
      <feDiffuseLighting in="noise" lighting-color="#ffffff" surfaceScale="2">
        <feDistantLight azimuth="45" elevation="60"/>
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
    </filter>
    <clipPath id="shirt-clip">
      <path d="M 200,150 
        Q 180,150 170,180 Q 160,220 180,280 Q 190,350 240,380
        L 560,380
        Q 610,350 620,280 Q 640,220 630,180 Q 620,150 600,150
        Q 560,120 400,120 Q 240,120 200,150 Z"/>
    </clipPath>
  </defs>
  
  <!-- Shadow -->
  <ellipse cx="400" cy="920" rx="180" ry="30" fill="rgba(0,0,0,0.15)"/>
  
  <!-- T-Shirt Body -->
  <g clip-path="url(#shirt-clip)" filter="url(#fabric-texture)">
    <path d="M 200,150 
      Q 180,150 170,180 Q 160,220 180,280 Q 190,350 240,380
      L 560,380
      Q 610,350 620,280 Q 640,220 630,180 Q 620,150 600,150
      Q 560,120 400,120 Q 240,120 200,150 Z" 
      fill="${isBack ? '#1a1a2e' : 'var(--fabric-color, #1a1a2e)'}" 
      stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
    
    ${!isBack ? `
    <!-- Neckline -->
    <ellipse cx="400" cy="150" rx="80" ry="20" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="3"/>
    <!-- Sleeves hint -->
    <path d="M 170,180 Q 120,200 130,260 Q 170,300 180,280" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="2"/>
    <path d="M 630,180 Q 680,200 670,260 Q 620,300 620,280" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="2"/>
    ` : ''}
  </g>
  
  ${isBack ? `
  <!-- Neckline back -->
  <ellipse cx="400" cy="150" rx="70" ry="15" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="2"/>
  ` : ''}
  
  <!-- Mockup Area Marker -->
  <rect x="160" y="180" width="480" height="650" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generateHoodieTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
  <defs>
    <filter id="hoodie-texture">
      <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" result="noise"/>
      <feDiffuseLighting in="noise" lighting-color="#ffffff" surfaceScale="3">
        <feDistantLight azimuth="45" elevation="60"/>
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
    </filter>
    <clipPath id="hoodie-clip">
      <path d="M 180,160 
        Q 160,160 150,200 Q 140,250 170,320 Q 180,400 230,450
        L 570,450
        Q 620,400 630,320 Q 640,250 630,200 Q 620,160 600,160
        Q 550,120 400,120 Q 250,120 200,160 Z"/>
    </clipPath>
  </defs>
  
  <ellipse cx="400" cy="920" rx="180" ry="30" fill="rgba(0,0,0,0.15)"/>
  
  <g clip-path="url(#hoodie-clip)" filter="url(#hoodie-texture)">
    <path d="M 180,160 
      Q 160,160 150,200 Q 140,250 170,320 Q 180,400 230,450
      L 570,450
      Q 620,400 630,320 Q 640,250 630,200 Q 620,160 600,160
      Q 550,120 400,120 Q 250,120 200,160 Z" 
      fill="var(--fabric-color, #1a1a2e)" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
    
    <!-- Hood -->
    <path d="M 220,160 Q 200,130 250,120 Q 350,110 450,120 Q 550,130 580,160" 
      fill="var(--fabric-color, #1a1a2e)" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
    <ellipse cx="400" cy="130" rx="120" ry="30" fill="var(--fabric-color, #1a1a2e)"/>
    
    <!-- Pocket -->
    <rect x="280" y="400" width="240" height="160" rx="10" 
      fill="rgba(0,0,0,0.05)" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>
    
    <!-- Drawstrings -->
    <path d="M 340,150 Q 330,120 360,110" fill="none" stroke="#555" stroke-width="3" stroke-linecap="round"/>
    <path d="M 460,150 Q 470,120 440,110" fill="none" stroke="#555" stroke-width="3" stroke-linecap="round"/>
  </g>
  
  <ellipse cx="400" cy="930" rx="180" ry="30" fill="rgba(0,0,0,0.15)"/>
  
  <rect x="160" y="250" width="480" height="500" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generateToteBagTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <filter id="canvas-texture">
      <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" result="noise"/>
      <feDiffuseLighting in="noise" lighting-color="#ffffff" surfaceScale="2">
        <feDistantLight azimuth="45" elevation="60"/>
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
    </filter>
    <clipPath id="tote-clip">
      <path d="M 150,100 L 650,100 L 680,150 L 680,650 L 120,650 L 120,150 Z"/>
    </clipPath>
  </defs>
  
  <ellipse cx="400" cy="750" rx="220" ry="40" fill="rgba(0,0,0,0.1)"/>
  
  <g clip-path="url(#tote-clip)" filter="url(#canvas-texture)">
    <path d="M 150,100 L 650,100 L 680,150 L 680,650 L 120,650 L 120,150 Z" 
      fill="var(--fabric-color, #f5f0e1)" stroke="rgba(0,0,0,0.1)" stroke-width="2"/>
    
    <!-- Handles -->
    <path d="M 220,100 Q 220,30 400,30 Q 580,30 580,100" 
      fill="none" stroke="var(--fabric-color, #f5f0e1)" stroke-width="16" stroke-linecap="round"/>
    <path d="M 220,100 Q 220,30 400,30 Q 580,30 580,100" 
      fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="18" stroke-linecap="round"/>
    
    <!-- Stitching -->
    <path d="M 150,100 L 650,100" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1" stroke-dasharray="5,5"/>
    <path d="M 120,150 L 120,650" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1" stroke-dasharray="5,5"/>
    <path d="M 680,150 L 680,650" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1" stroke-dasharray="5,5"/>
  </g>
  
  <rect x="120" y="150" width="560" height="500" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generateMugTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 450" width="1200" height="450">
  <defs>
    <filter id="ceramic-gloss">
      <feGaussianBlur stdDeviation="1" result="blur"/>
      <feSpecularLighting surfaceScale="5" specularConstant="1.5" specularExponent="20" lighting-color="#ffffff" result="spec">
        <fePointLight x="600" y="-200" z="300"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="spec"/>
      <feComposite in="SourceGraphic" in2="spec" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
    </filter>
    <linearGradient id="mug-rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="50%" stop-color="#e0e0e0"/>
      <stop offset="100%" stop-color="#cccccc"/>
    </linearGradient>
    <radialGradient id="mug-body" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="70%" stop-color="#f0f0f0"/>
      <stop offset="100%" stop-color="#e0e0e0"/>
    </radialGradient>
  </defs>
  
  <!-- Shadow -->
  <ellipse cx="600" cy="420" rx="280" ry="20" fill="rgba(0,0,0,0.15)"/>
  
  <!-- Mug Body -->
  <g filter="url(#ceramic-gloss)">
    <path d="M 150,50 
      L 1050,50
      Q 1100,50 1100,100
      L 1100,380
      Q 1100,430 1050,430
      L 150,430
      Q 100,430 100,380
      L 100,100
      Q 100,50 150,50 Z" 
      fill="url(#mug-body)" stroke="url(#mug-rim)" stroke-width="4"/>
    
    <!-- Handle -->
    <path d="M 1050,150 Q 1200,150 1200,225 Q 1200,300 1050,300" 
      fill="none" stroke="url(#mug-body)" stroke-width="50" stroke-linecap="round"/>
    <path d="M 1050,150 Q 1200,150 1200,225 Q 1200,300 1050,300" 
      fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="54" stroke-linecap="round"/>
    
    <!-- Inner rim -->
    <ellipse cx="600" cy="50" rx="450" ry="15" fill="url(#mug-rim)"/>
  </g>
  
  <!-- Shadow -->
  <ellipse cx="600" cy="430" rx="280" ry="20" fill="rgba(0,0,0,0.15)"/>
  
  <!-- Mockup Area -->
  <rect x="150" y="65" width="900" height="315" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generatePhoneCaseTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800">
  <defs>
    <filter id="case-texture">
      <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" result="noise"/>
      <feDiffuseLighting in="noise" lighting-color="#ffffff" surfaceScale="2">
        <feDistantLight azimuth="45" elevation="60"/>
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
    </filter>
    <clipPath id="case-clip">
      <rect x="0" y="0" width="400" height="800" rx="40" ry="40"/>
    </clipPath>
  </defs>
  
  <rect x="0" y="0" width="400" height="800" rx="40" ry="40" fill="rgba(0,0,0,0.15)" filter="blur(10)"/>
  
  <g clip-path="url(#case-clip)" filter="url(#case-texture)">
    <rect x="0" y="0" width="400" height="800" rx="40" ry="40" 
      fill="var(--fabric-color, #1a1a2e)" stroke="rgba(0,0,0,0.1)" stroke-width="2"/>
    
    <!-- Camera cutout -->
    <rect x="300" y="20" width="80" height="80" rx="10" fill="rgba(0,0,0,0.3)"/>
    <circle cx="320" cy="50" r="25" fill="rgba(0,0,0,0.5)"/>
    
    <!-- Side buttons -->
    <rect x="-5" y="150" width="10" height="60" rx="5" fill="rgba(0,0,0,0.3)"/>
    <rect x="395" y="150" width="10" height="60" rx="5" fill="rgba(0,0,0,0.3)"/>
    <rect x="395" y="350" width="10" height="80" rx="5" fill="rgba(0,0,0,0.3)"/>
    
    <!-- Bottom cutout -->
    <rect x="150" y="785" width="100" height="15" rx="5" fill="rgba(0,0,0,0.2)"/>
  </g>
  
  <rect x="0" y="0" width="400" height="800" rx="40" ry="40" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generatePillowTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <filter id="fabric-pillow">
      <feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="2" result="noise"/>
      <feDiffuseLighting in="noise" lighting-color="#ffffff" surfaceScale="5">
        <feDistantLight azimuth="45" elevation="60"/>
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
    </filter>
    <clipPath id="pillow-clip">
      <rect x="100" y="100" width="600" height="600" rx="30" ry="30"/>
    </clipPath>
  </defs>
  
  <!-- Shadow -->
  <ellipse cx="400" cy="730" rx="280" ry="50" fill="rgba(0,0,0,0.2)"/>
  
  <g clip-path="url(#pillow-clip)" filter="url(#fabric-pillow)">
    <rect x="100" y="100" width="600" height="600" rx="30" ry="30" 
      fill="var(--fabric-color, #ffffff)" stroke="rgba(0,0,0,0.1)" stroke-width="2"/>
    
    <!-- Piping/Edging -->
    <rect x="100" y="100" width="600" height="600" rx="30" ry="30" 
      fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="4"/>
    
    <!-- Tufting buttons (optional) -->
    <circle cx="400" cy="400" r="12" fill="rgba(0,0,0,0.05)" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
  </g>
  
  <rect x="100" y="100" width="600" height="600" rx="30" ry="30" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generatePosterFrameTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="wall-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f5f5f5"/>
      <stop offset="100%" stop-color="#e8e8e8"/>
    </linearGradient>
    <filter id="frame-shadow">
      <feDropShadow dx="4" dy="8" stdDeviation="8" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
    <filter id="glass-glare">
      <feGaussianBlur stdDeviation="20" result="blur"/>
      <feSpecularLighting surfaceScale="1" specularConstant="1" specularExponent="10" lighting-color="#ffffff" result="spec">
        <fePointLight x="400" y="-200" z="400"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="spec"/>
      <feComposite in="SourceGraphic" in2="spec" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
    </filter>
  </defs>
  
  <!-- Wall -->
  <rect x="0" y="0" width="800" height="800" fill="url(#wall-gradient)"/>
  
  <!-- Baseboard -->
  <rect x="0" y="720" width="800" height="80" fill="#d0d0d0"/>
  <rect x="0" y="720" width="800" height="4" fill="#b0b0b0"/>
  
  <!-- Frame with Shadow -->
  <g filter="url(#frame-shadow)">
    <!-- Frame -->
    <rect x="150" y="150" width="500" height="500" rx="4" ry="4" fill="#2d2d2d" stroke="#1a1a1a" stroke-width="2"/>
    <rect x="165" y="165" width="470" height="470" rx="2" ry="2" fill="#1a1a1a"/>
    
    <!-- Matting -->
    <rect x="185" y="185" width="430" height="430" fill="#fafafa"/>
    <rect x="185" y="185" width="430" height="430" fill="none" stroke="#e0e0e0" stroke-width="1"/>
    
    <!-- Glass Glare -->
    <rect x="185" y="185" width="430" height="430" fill="url(#glass-glare)" opacity="0.1"/>
  </g>
  
  <!-- Mockup Area (inside matting) -->
  <rect x="185" y="185" width="430" height="430" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generateBusinessCardsTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <defs>
    <filter id="card-shadow">
      <feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.2"/>
    </filter>
    <filter id="paper-texture">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/>
      <feDiffuseLighting in="noise" lighting-color="#ffffff" surfaceScale="1">
        <feDistantLight azimuth="45" elevation="60"/>
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
    </filter>
  </defs>
  
  <ellipse cx="400" cy="480" rx="200" ry="20" fill="rgba(0,0,0,0.1)"/>
  
  <!-- Card stack -->
  <g filter="url(#card-shadow)">
    <!-- Bottom card -->
    <g filter="url(#paper-texture)">
      <rect x="150" y="150" width="350" height="200" rx="8" ry="8" fill="#ffffff" stroke="#e0e0e0" stroke-width="1"/>
    </g>
    <!-- Middle card -->
    <g filter="url(#paper-texture)">
      <rect x="180" y="120" width="350" height="200" rx="8" ry="8" fill="#ffffff" stroke="#e0e0e0" stroke-width="1"/>
    </g>
    <!-- Top card -->
    <g filter="url(#paper-texture)">
      <rect x="210" y="90" width="350" height="200" rx="8" ry="8" 
        fill="var(--fabric-color, #ffffff)" stroke="#e0e0e0" stroke-width="1"/>
    </g>
  </g>
  
  <!-- Mockup Area (top card) -->
  <rect x="210" y="90" width="350" height="200" rx="8" ry="8" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generateWoodPlaqueTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="800" height="400">
  <defs>
    <pattern id="wood-grain" width="200" height="400" patternUnits="userSpaceOnUse">
      <image href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='400'%3E%3Crect fill='%238B6914' width='200' height='400'/%3E%3Cpath d='M0,50 Q100,40 200,60' stroke='%236B4A0F' stroke-width='0.5' fill='none' opacity='0.3'/%3E%3Cpath d='M0,150 Q100,140 200,160' stroke='%236B4A0F' stroke-width='0.5' fill='none' opacity='0.3'/%3E%3Cpath d='M0,250 Q100,240 200,260' stroke='%236B4A0F' stroke-width='0.5' fill='none' opacity='0.3'/%3E%3Cpath d='M0,350 Q100,340 200,360' stroke='%236B4A0F' stroke-width='0.5' fill='none' opacity='0.3'/%3E%3C/svg%3E" x="0" y="0" width="200" height="400"/>
    </pattern>
    <filter id="wood-shadow">
      <feDropShadow dx="4" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
    <filter id="engrave-effect">
      <feMorphology operator="erode" radius="1" in="SourceAlpha" result="eroded"/>
      <feFlood flood-color="#3d2b0f" result="engraveColor"/>
      <feComposite in="engraveColor" in2="eroded" operator="in" result="engraved"/>
      <feComposite in="SourceGraphic" in2="engraved" operator="over"/>
    </filter>
  </defs>
  
  <!-- Shadow -->
  <ellipse cx="400" cy="380" rx="180" ry="15" fill="rgba(0,0,0,0.2)"/>
  
  <!-- Plaque -->
  <g filter="url(#wood-shadow)">
    <rect x="50" y="30" width="700" height="340" rx="20" ry="20" fill="url(#wood-grain)" stroke="#5d3a0f" stroke-width="3"/>
    
    <!-- Beveled edge -->
    <rect x="50" y="30" width="700" height="340" rx="20" ry="20" fill="none" stroke="rgba(139,105,20,0.3)" stroke-width="4"/>
    <rect x="50" y="30" width="700" height="340" rx="20" ry="20" fill="none" stroke="rgba(139,105,20,0.1)" stroke-width="8"/>
    
    <!-- Engraved text area -->
    <rect x="100" y="80" width="600" height="240" rx="10" ry="10" fill="rgba(61,43,15,0.2)" filter="url(#engrave-effect)"/>
  </g>
  
  <!-- Mockup Area -->
  <rect x="100" y="80" width="600" height="240" rx="10" ry="10" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generateAcrylicNightLightTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <radialGradient id="acrylic-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="var(--neon-color, #00ffff)" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="var(--neon-color, #00ffff)" stop-opacity="0.8"/>
    </radialGradient>
    <filter id="neon-glow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="base-glow">
      <feGaussianBlur stdDeviation="20" result="glow"/>
      <feMerge>
        <feMergeNode in="glow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <linearGradient id="base-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#0d0d1a"/>
    </linearGradient>
  </defs>
  
  <!-- Base -->
  <rect x="200" y="680" width="400" height="100" rx="10" ry="10" fill="url(#base-gradient)" stroke="#333" stroke-width="2"/>
  <rect x="280" y="690" width="240" height="20" rx="5" fill="#222" stroke="#444" stroke-width="1"/>
  <rect x="330" y="695" width="140" height="10" rx="3" fill="#00ffff" opacity="0.3"/>
  
  <!-- LED strip -->
  <rect x="250" y="650" width="300" height="4" rx="2" fill="#00ffff" filter="url(#base-glow)" opacity="0.8"/>
  
  <!-- Acrylic Panel -->
  <g filter="url(#neon-glow)">
    <rect x="150" y="100" width="500" height="500" rx="20" ry="20" 
      fill="none" stroke="var(--neon-color, #00ffff)" stroke-width="3" filter="url(#neon-glow)"/>
    
    <!-- Engraved design area (glows on edges) -->
    <rect x="170" y="120" width="460" height="460" rx="15" ry="15" 
      fill="none" stroke="var(--neon-color, #00ffff)" stroke-width="2" opacity="0.6" filter="url(#neon-glow)"/>
  </g>
  
  <!-- Light rays -->
  <g opacity="0.15">
    <path d="M 400,600 L 200,100 L 600,100 Z" fill="var(--neon-color, #00ffff)" filter="url(#base-glow)"/>
    <path d="M 400,600 L 150,350 L 150,450 Z" fill="var(--neon-color, #00ffff)" filter="url(#base-glow)"/>
    <path d="M 400,600 L 650,350 L 650,450 Z" fill="var(--neon-color, #00ffff)" filter="url(#base-glow)"/>
  </g>
  
  <!-- Mockup Area -->
  <rect x="170" y="120" width="460" height="460" rx="15" ry="15" 
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
    data-mockup-area="true" opacity="0"/>
</svg>`
}

function generateWallClockTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <radialGradient id="clock-face-gradient" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f0f0f0"/>
    </radialGradient>
    <filter id="clock-shadow">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.25"/>
    </filter>
    <filter id="glass-reflection">
      <feGaussianBlur stdDeviation="30" result="blur"/>
      <feSpecularLighting surfaceScale="1" specularConstant="1" specularExponent="20" lighting-color="#ffffff" result="spec">
        <fePointLight x="400" y="-300" z="500"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="spec"/>
      <feComposite in="SourceGraphic" in2="spec" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
    </filter>
  </defs>
  
  <!-- Shadow -->
  <ellipse cx="400" cy="750" rx="280" ry="40" fill="rgba(0,0,0,0.15)"/>
  
  <!-- Clock Body -->
  <g filter="url(#clock-shadow)">
    <circle cx="400" cy="400" r="320" fill="#fafafa" stroke="#ddd" stroke-width="4"/>
    <circle cx="400" cy="400" r="310" fill="url(#clock-face-gradient)"/>
    
    <!-- Hour markers -->
    <g stroke="#333" stroke-width="3" stroke-linecap="round">
      ${Array.from({length: 12}, (_, i) => {
        const angle = (i * 30 - 90) * Math.PI / 180
        const inner = i % 3 === 0 ? 240 : 260
        const outer = 280
        const x1 = 400 + Math.cos(angle) * inner
        const y1 = 400 + Math.sin(angle) * inner
        const x2 = 400 + Math.cos(angle) * outer
        const y2 = 400 + Math.sin(angle) * outer
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${i % 3 === 0 ? '5' : '3'}" stroke="${i % 3 === 0 ? '#1a1a1a' : '#555'}" stroke-linecap="round"/>`
      }).join('')}
    </g>
    
    <!-- Center dot -->
    <circle cx="400" cy="400" r="8" fill="#1a1a1a"/>
    
    <!-- Hands (static at 10:10) -->
    <g transform-origin="400 400">
      <line x1="400" y1="400" x2="400" y2="150" stroke="#1a1a1a" stroke-width="6" stroke-linecap="round"/>
      <line x1="400" y1="400" x2="580" y2="400" stroke="#1a1a1a" stroke-width="4" stroke-linecap="round"/>
      <line x1="400" y1="400" x2="400" y2="550" stroke="#e74c3c" stroke-width="2" stroke-linecap="round"/>
    </g>
    
    <!-- Glass reflection -->
    <ellipse cx="400" cy="280" rx="200" ry="80" fill="url(#glass-reflection)" opacity="0.1"/>
    
    <!-- Mockup Area (custom face) -->
    <circle cx="400" cy="400" r="220" 
      fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="10,10"
      data-mockup-area="true" opacity="0"/>
  </g>
</svg>`
}

// ============================================
// MAIN PANEL COMPONENT
// ============================================

export function MockupPanel() {
  const editor = useEditor()
  const [selectedMockup, setSelectedMockup] = useState<MockupTemplate | null>(null)
  const [fabricColor, setFabricColor] = useState<string>('#1a1a2e')
  const [neonColor, setNeonColor] = useState<string>('#00ffff')
  const [previewScale, setPreviewScale] = useState(1)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  
  // Load current canvas design for preview
  const [canvasSnapshot, setCanvasSnapshot] = useState<string>('')
  
  useEffect(() => {
    // Capture the current page as a PNG for the mockup preview
    const id = editor.state.activePageId
    const page = editor.state.doc.pages.find(p => p.id === id)
    if (!page) return
    let active = true
    const size = getPageSize(editor.state.doc, id)
    void renderPageToCanvas(page, size, editor.loadContext, { multiplier: 1 })
      .then(canvas => { if (active) setCanvasSnapshot(canvas.toDataURL('image/png')) })
      .catch(() => { if (active) setCanvasSnapshot('') })
    return () => { active = false }
  }, [editor])
  
  const handleColorChange = (color: string) => {
    setFabricColor(color)
    if (previewRef.current) {
      previewRef.current.style.setProperty('--fabric-color', color)
    }
  }
  
  const handleNeonChange = (color: string) => {
    setNeonColor(color)
    if (previewRef.current) {
      previewRef.current.style.setProperty('--neon-color', color)
    }
  }
  
  const handleMapDesign = useCallback(async () => {
    if (!selectedMockup || !canvasSnapshot) {
      editor.toast('Select a mockup first', 'info')
      return
    }
    
    try {
      // Create mockup with current canvas design
      const mockupSvg = await generateMockupWithDesign(selectedMockup, canvasSnapshot, fabricColor, neonColor)
      
      // Insert onto canvas
      await editor.insert.svgElement(mockupSvg, `mockup:${selectedMockup.id}`, selectedMockup.name)
      editor.toast(`Mapped design onto ${selectedMockup.name}`, 'success')
    } catch {
      editor.toast('Failed to create mockup', 'error')
    }
  }, [editor, selectedMockup, canvasSnapshot, fabricColor, neonColor])
  
  const handleDownload = useCallback(async () => {
    if (!selectedMockup || !canvasSnapshot) return
    
    try {
      const mockupSvg = await generateMockupWithDesign(selectedMockup, canvasSnapshot, fabricColor, neonColor)
      const blob = new Blob([mockupSvg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mockup-${selectedMockup.id}.svg`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      editor.toast('Failed to download mockup', 'error')
    }
  }, [editor, selectedMockup, canvasSnapshot, fabricColor, neonColor])
  
  const template = selectedMockup
  const isAcrylic = template?.id === 'acrylic-night-light'
  
  return (
    <div className={styles.panel} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ed-border)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} /> Product Mockup Studio
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowFullscreen(!showFullscreen)} className={styles.actionBtn} title={showFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {showFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>
      </div>
      
      {/* Mockup Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {MOCKUP_TEMPLATES.map(mockup => (
          <MockupCard
            key={mockup.id}
            mockup={mockup}
            selected={selectedMockup?.id === mockup.id}
            onSelect={setSelectedMockup}
            previewScale={previewScale}
          />
        ))}
      </div>
      
      {/* Selected Mockup Preview & Controls */}
      {selectedMockup && (
        <div className={styles.previewSection} style={{ borderTop: '1px solid var(--ed-border)', padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Preview */}
            <div ref={previewRef} className={styles.mockupPreview} style={{ 
              position: 'relative', 
              background: 'var(--ed-surface-2)', 
              borderRadius: 12, 
              overflow: 'hidden',
              border: '1px solid var(--ed-border)',
              minHeight: 300,
            }}>
              <Suspense fallback={<div className={styles.loading}>Rendering mockup...</div>}>
                <MockupRenderer
                  template={selectedMockup}
                  designImage={canvasSnapshot}
                  fabricColor={fabricColor}
                  neonColor={neonColor}
                  scale={previewScale}
                />
              </Suspense>
            </div>
            
            {/* Controls */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              {/* Fabric Color */}
              {template?.fabricColors && template.fabricColors.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 11, color: 'var(--ed-text-dim)', whiteSpace: 'nowrap' }}>Fabric:</label>
                  <input type="color" value={fabricColor} onChange={e => handleColorChange(e.target.value)} style={{ width: 36, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                  <input type="text" value={fabricColor} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) handleColorChange(e.target.value) }} style={{ width: 90, padding: '6px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12, fontFamily: 'monospace' }} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {template.fabricColors.map(c => (
                      <button key={c} onClick={() => handleColorChange(c)} style={{ width: 24, height: 24, borderRadius: 4, background: c, border: fabricColor === c ? '2px solid var(--ed-accent)' : '1px solid var(--ed-border)', cursor: 'pointer' }} title={c} />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Neon Color for Acrylic */}
              {isAcrylic && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 11, color: 'var(--ed-text-dim)', whiteSpace: 'nowrap' }}>Neon:</label>
                  <input type="color" value={neonColor} onChange={e => handleNeonChange(e.target.value)} style={{ width: 36, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                  <input type="text" value={neonColor} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) handleNeonChange(e.target.value) }} style={{ width: 90, padding: '6px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12, fontFamily: 'monospace' }} />
                </div>
              )}
              
              {/* Scale */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Scale</label>
                <input type="range" min="0.5" max="2" step="0.1" value={previewScale} onChange={e => setPreviewScale(Number(e.target.value))} style={{ width: 150 }} />
                <span style={{ fontSize: 12, minWidth: 40 }}>{Math.round(previewScale * 100)}%</span>
              </div>
              
              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                <button onClick={handleMapDesign} className={styles.primaryBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Wand2 size={14} /> Map Design to Mockup
                </button>
                <button onClick={handleDownload} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Download size={14} /> Download SVG
                </button>
                <button onClick={() => setShowFullscreen(true)} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Maximize size={14} /> Fullscreen
                </button>
              </div>
            </div>
            
            {/* Description */}
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ed-text-dim)', lineHeight: 1.5 }}>
              {selectedMockup.description}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function MockupCard({ mockup, selected, onSelect, previewScale }: { mockup: MockupTemplate; selected: boolean; onSelect: (m: MockupTemplate) => void; previewScale: number }) {
  return (
    <div
      className={`${styles.mockupCard} ${selected ? styles.selected : ''}`}
      onClick={() => onSelect(mockup)}
      style={{
        background: 'var(--ed-surface-2)',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        border: `2px solid ${selected ? 'var(--ed-accent)' : 'transparent'}`,
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ 
        aspectRatio: `${mockup.exportWidth}/${mockup.exportHeight}`,
        background: 'var(--ed-surface-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div 
          dangerouslySetInnerHTML={{ __html: mockup.templateSvg.replace('var(--fabric-color, #1a1a2e)', '#1a1a2e') }} 
          style={{ width: '100%', height: '100%', transform: `scale(${previewScale * 0.9})`, transformOrigin: 'center' }}
        />
      </div>
      <div style={{ padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>{mockup.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mockup.name}</div>
            <div style={{ fontSize: 10, color: 'var(--ed-text-dim)' }}>{mockup.category}</div>
          </div>
        </div>
        {mockup.fabricColors && mockup.fabricColors.length > 0 && (
          <div style={{ display: 'flex', gap: 3 }}>
            {mockup.fabricColors.slice(0, 5).map(c => (
              <div key={c} style={{ width: 12, height: 12, borderRadius: 2, background: c, border: '1px solid var(--ed-border)' }} />
            ))}
            {mockup.fabricColors.length > 5 && <span style={{ fontSize: 9, color: 'var(--ed-text-dim)', alignSelf: 'center' }}>+{mockup.fabricColors.length - 5}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// MOCKUP GENERATION LOGIC
// ============================================

export async function generateMockupWithDesign(
  template: MockupTemplate,
  designImage: string,
  fabricColor: string,
  neonColor: string
): Promise<string> {
  // Replace placeholder with actual design
  const svg = template.templateSvg
    .replace('var(--fabric-color, #1a1a2e)', fabricColor)
    .replace('var(--neon-color, #00ffff)', neonColor)
  
  // Find the mockup area and replace with design image
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')
  const mockupArea = doc.querySelector('[data-mockup-area="true"]')
  
  if (mockupArea) {
    const x = mockupArea.getAttribute('x') || '0'
    const y = mockupArea.getAttribute('y') || '0'
    const width = mockupArea.getAttribute('width') || '100%'
    const height = mockupArea.getAttribute('height') || '100%'
    const rx = mockupArea.getAttribute('rx') || '0'
    const ry = mockupArea.getAttribute('ry') || '0'
    
    // Create image element
    const img = doc.createElementNS('http://www.w3.org/2000/svg', 'image')
    img.setAttribute('href', designImage)
    img.setAttribute('x', x)
    img.setAttribute('y', y)
    img.setAttribute('width', width)
    img.setAttribute('height', height)
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice')
    if (rx !== '0') img.setAttribute('rx', rx)
    if (ry !== '0') img.setAttribute('ry', ry)
    
    // Apply clipping if needed
    if (rx !== '0' || ry !== '0') {
      const clipId = `mockup-clip-${Date.now()}`
      const clipPath = doc.createElementNS('http://www.w3.org/2000/svg', 'clipPath')
      clipPath.setAttribute('id', clipId)
      const clipRect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      clipRect.setAttribute('x', x)
      clipRect.setAttribute('y', y)
      clipRect.setAttribute('width', width)
      clipRect.setAttribute('height', height)
      clipRect.setAttribute('rx', rx)
      clipRect.setAttribute('ry', ry)
      clipPath.appendChild(clipRect)
      
      const defs = doc.querySelector('defs') || doc.createElementNS('http://www.w3.org/2000/svg', 'defs')
      if (!defs.parentNode) doc.documentElement.insertBefore(defs, doc.documentElement.firstChild)
      defs.appendChild(clipPath)
      img.setAttribute('clip-path', `url(#${clipId})`)
    }
    
    mockupArea.parentNode?.replaceChild(img, mockupArea)
  }
  
  return new XMLSerializer().serializeToString(doc)
}