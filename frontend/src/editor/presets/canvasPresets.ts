/**
 * Canvas Presets — 1-click resizers for Social Media, Print, and Laser/Sublimation Workshop
 * All dimensions in pixels at specified DPI
 */
export interface CanvasPreset {
  id: string
  name: string
  width: number
  height: number
  dpi: number
  category: 'social' | 'print' | 'workshop'
  subcategory?: string
  description?: string
  aspectRatio?: string
}

// ============================================
// SOCIAL MEDIA PRESETS
// ============================================
export const SOCIAL_PRESETS: CanvasPreset[] = [
  // Instagram
  { id: 'ig-post', name: 'Instagram Post', width: 1080, height: 1080, dpi: 72, category: 'social', subcategory: 'Instagram', aspectRatio: '1:1', description: 'Square feed post' },
  { id: 'ig-portrait', name: 'Instagram Portrait', width: 1080, height: 1350, dpi: 72, category: 'social', subcategory: 'Instagram', aspectRatio: '4:5', description: 'Portrait feed post' },
  { id: 'ig-story', name: 'Instagram Story/Reel', width: 1080, height: 1920, dpi: 72, category: 'social', subcategory: 'Instagram', aspectRatio: '9:16', description: 'Full-screen story or Reel' },
  { id: 'ig-reel-cover', name: 'Instagram Reel Cover', width: 1080, height: 1920, dpi: 72, category: 'social', subcategory: 'Instagram', aspectRatio: '9:16', description: 'Reel cover thumbnail' },
  { id: 'ig-profile', name: 'Instagram Profile Photo', width: 320, height: 320, dpi: 72, category: 'social', subcategory: 'Instagram', aspectRatio: '1:1', description: 'Profile picture' },
  
  // Facebook
  { id: 'fb-post', name: 'Facebook Post', width: 1200, height: 630, dpi: 72, category: 'social', subcategory: 'Facebook', aspectRatio: '1.91:1', description: 'Shared link/image post' },
  { id: 'fb-cover', name: 'Facebook Cover', width: 1640, height: 924, dpi: 72, category: 'social', subcategory: 'Facebook', aspectRatio: '16:9', description: 'Page/profile cover photo' },
  { id: 'fb-story', name: 'Facebook Story', width: 1080, height: 1920, dpi: 72, category: 'social', subcategory: 'Facebook', aspectRatio: '9:16', description: 'Full-screen story' },
  { id: 'fb-event', name: 'Facebook Event', width: 1920, height: 1080, dpi: 72, category: 'social', subcategory: 'Facebook', aspectRatio: '16:9', description: 'Event cover photo' },
  
  // YouTube
  { id: 'yt-thumbnail', name: 'YouTube Thumbnail', width: 1280, height: 720, dpi: 72, category: 'social', subcategory: 'YouTube', aspectRatio: '16:9', description: 'Video thumbnail' },
  { id: 'yt-banner', name: 'YouTube Banner', width: 2560, height: 1440, dpi: 72, category: 'social', subcategory: 'YouTube', aspectRatio: '16:9', description: 'Channel art (safe area 1546x423)' },
  { id: 'yt-shorts', name: 'YouTube Shorts', width: 1080, height: 1920, dpi: 72, category: 'social', subcategory: 'YouTube', aspectRatio: '9:16', description: 'Shorts video' },
  
  // TikTok
  { id: 'tiktok-video', name: 'TikTok Video', width: 1080, height: 1920, dpi: 72, category: 'social', subcategory: 'TikTok', aspectRatio: '9:16', description: 'Full-screen video' },
  { id: 'tiktok-profile', name: 'TikTok Profile', width: 200, height: 200, dpi: 72, category: 'social', subcategory: 'TikTok', aspectRatio: '1:1', description: 'Profile photo' },
  
  // Twitter/X
  { id: 'twitter-post', name: 'X/Twitter Post', width: 1600, height: 900, dpi: 72, category: 'social', subcategory: 'X/Twitter', aspectRatio: '16:9', description: 'Tweet image' },
  { id: 'twitter-header', name: 'X/Twitter Header', width: 1500, height: 500, dpi: 72, category: 'social', subcategory: 'X/Twitter', aspectRatio: '3:1', description: 'Profile banner' },
  { id: 'twitter-profile', name: 'X/Twitter Profile', width: 400, height: 400, dpi: 72, category: 'social', subcategory: 'X/Twitter', aspectRatio: '1:1', description: 'Profile photo' },
  
  // LinkedIn
  { id: 'linkedin-post', name: 'LinkedIn Post', width: 1200, height: 627, dpi: 72, category: 'social', subcategory: 'LinkedIn', aspectRatio: '1.91:1', description: 'Feed post' },
  { id: 'linkedin-banner', name: 'LinkedIn Banner', width: 1584, height: 396, dpi: 72, category: 'social', subcategory: 'LinkedIn', aspectRatio: '4:1', description: 'Company/page banner' },
  
  // Pinterest
  { id: 'pinterest-pin', name: 'Pinterest Pin', width: 1000, height: 1500, dpi: 72, category: 'social', subcategory: 'Pinterest', aspectRatio: '2:3', description: 'Standard pin' },
  { id: 'pinterest-story', name: 'Pinterest Story Pin', width: 1080, height: 1920, dpi: 72, category: 'social', subcategory: 'Pinterest', aspectRatio: '9:16', description: 'Story pin' },
  
  // WhatsApp
  { id: 'whatsapp-status', name: 'WhatsApp Status', width: 1080, height: 1920, dpi: 72, category: 'social', subcategory: 'WhatsApp', aspectRatio: '9:16', description: 'Status update' },
]

// ============================================
// PRINT PRESETS (300 DPI)
// ============================================
export const PRINT_PRESETS: CanvasPreset[] = [
  // ISO Paper
  { id: 'a4', name: 'A4', width: 2480, height: 3508, dpi: 300, category: 'print', subcategory: 'ISO Paper', aspectRatio: '1:1.414', description: 'Standard letter/document' },
  { id: 'a3', name: 'A3', width: 3508, height: 4961, dpi: 300, category: 'print', subcategory: 'ISO Paper', aspectRatio: '1:1.414', description: 'Poster/small poster' },
  { id: 'a5', name: 'A5', width: 1748, height: 2480, dpi: 300, category: 'print', subcategory: 'ISO Paper', aspectRatio: '1:1.414', description: 'Half letter' },
  { id: 'a6', name: 'A6', width: 1240, height: 1748, dpi: 300, category: 'print', subcategory: 'ISO Paper', aspectRatio: '1:1.414', description: 'Postcard' },
  
  // US Paper
  { id: 'letter', name: 'US Letter', width: 2550, height: 3300, dpi: 300, category: 'print', subcategory: 'US Paper', aspectRatio: '8.5:11', description: 'Standard US letter' },
  { id: 'legal', name: 'US Legal', width: 2550, height: 4200, dpi: 300, category: 'print', subcategory: 'US Paper', aspectRatio: '8.5:14', description: 'Legal document' },
  { id: 'tabloid', name: 'Tabloid (11x17)', width: 3300, height: 5100, dpi: 300, category: 'print', subcategory: 'US Paper', aspectRatio: '11:17', description: 'Large format' },
  
  // Business Cards
  { id: 'business-card-us', name: 'Business Card (US)', width: 1050, height: 600, dpi: 300, category: 'print', subcategory: 'Business Cards', aspectRatio: '1.75:1', description: '3.5 x 2 inches' },
  { id: 'business-card-eu', name: 'Business Card (EU)', width: 1050, height: 591, dpi: 300, category: 'print', subcategory: 'Business Cards', aspectRatio: '1.78:1', description: '85 x 55 mm' },
  { id: 'business-card-square', name: 'Square Business Card', width: 750, height: 750, dpi: 300, category: 'print', subcategory: 'Business Cards', aspectRatio: '1:1', description: '2.5 x 2.5 inches' },
  
  // Postcards
  { id: 'postcard-us', name: 'Postcard (US)', width: 1800, height: 1200, dpi: 300, category: 'print', subcategory: 'Postcards', aspectRatio: '3:2', description: '6 x 4 inches' },
  { id: 'postcard-eu', name: 'Postcard (EU)', width: 1772, height: 1181, dpi: 300, category: 'print', subcategory: 'Postcards', aspectRatio: '1.5:1', description: 'A6 (148 x 105 mm)' },
  
  // Flyers
  { id: 'flyer-a5', name: 'Flyer A5', width: 1748, height: 2480, dpi: 300, category: 'print', subcategory: 'Flyers', aspectRatio: '1:1.414', description: 'Half-page flyer' },
  { id: 'flyer-dl', name: 'Flyer DL (Envelope)', width: 2894, height: 1181, dpi: 300, category: 'print', subcategory: 'Flyers', aspectRatio: '2.45:1', description: '99 x 210 mm' },
  
  // Posters
  { id: 'poster-a2', name: 'Poster A2', width: 4961, height: 7016, dpi: 300, category: 'print', subcategory: 'Posters', aspectRatio: '1:1.414', description: 'Medium poster' },
  { id: 'poster-a1', name: 'Poster A1', width: 7016, height: 9933, dpi: 300, category: 'print', subcategory: 'Posters', aspectRatio: '1:1.414', description: 'Large poster' },
  { id: 'poster-a0', name: 'Poster A0', width: 9933, height: 14043, dpi: 300, category: 'print', subcategory: 'Posters', aspectRatio: '1:1.414', description: 'Extra large poster' },
  { id: 'poster-18x24', name: 'Poster 18x24 in', width: 5400, height: 7200, dpi: 300, category: 'print', subcategory: 'Posters', aspectRatio: '3:4', description: 'Standard movie poster' },
  { id: 'poster-24x36', name: 'Poster 24x36 in', width: 7200, height: 10800, dpi: 300, category: 'print', subcategory: 'Posters', aspectRatio: '2:3', description: 'Large movie poster' },
]

// ============================================
// LASER / SUBLIMATION / WORKSHOP PRESETS
// ============================================
export const WORKSHOP_PRESETS: CanvasPreset[] = [
  // Apparel Sublimation
  { id: 'tshirt-front', name: 'T-Shirt Front', width: 3600, height: 4800, dpi: 300, category: 'workshop', subcategory: 'Apparel', aspectRatio: '3:4', description: '12 x 16 inches printable area' },
  { id: 'tshirt-back', name: 'T-Shirt Back', width: 3600, height: 4800, dpi: 300, category: 'workshop', subcategory: 'Apparel', aspectRatio: '3:4', description: '12 x 16 inches printable area' },
  { id: 'tshirt-sleeve', name: 'T-Shirt Sleeve', width: 1200, height: 3600, dpi: 300, category: 'workshop', subcategory: 'Apparel', aspectRatio: '1:3', description: '4 x 12 inches' },
  { id: 'hoodie-front', name: 'Hoodie Front', width: 3600, height: 4800, dpi: 300, category: 'workshop', subcategory: 'Apparel', aspectRatio: '3:4', description: '12 x 16 inches (avoid pocket)' },
  { id: 'tote-bag', name: 'Tote Bag', width: 3600, height: 3600, dpi: 300, category: 'workshop', subcategory: 'Apparel', aspectRatio: '1:1', description: '12 x 12 inches' },
  { id: 'cap-front', name: 'Cap Front', width: 1500, height: 900, dpi: 300, category: 'workshop', subcategory: 'Apparel', aspectRatio: '5:3', description: '5 x 3 inches embroidery area' },
  { id: 'cap-side', name: 'Cap Side', width: 900, height: 900, dpi: 300, category: 'workshop', subcategory: 'Apparel', aspectRatio: '1:1', description: '3 x 3 inches' },
  
  // Drinkware
  { id: 'mug-11oz', name: 'Mug 11oz Wrap', width: 3000, height: 1125, dpi: 300, category: 'workshop', subcategory: 'Drinkware', aspectRatio: '8:3', description: '10 x 3.75 inches wrap' },
  { id: 'mug-15oz', name: 'Mug 15oz Wrap', width: 3000, height: 1350, dpi: 300, category: 'workshop', subcategory: 'Drinkware', aspectRatio: '20:9', description: '10 x 4.5 inches wrap' },
  { id: 'tumbler-20oz', name: 'Tumbler 20oz Wrap', width: 3300, height: 1500, dpi: 300, category: 'workshop', subcategory: 'Drinkware', aspectRatio: '11:5', description: '11 x 5 inches wrap' },
  { id: 'water-bottle', name: 'Water Bottle Wrap', width: 3000, height: 1800, dpi: 300, category: 'workshop', subcategory: 'Drinkware', aspectRatio: '5:3', description: '10 x 6 inches' },
  
  // Home Decor
  { id: 'pillow-16x16', name: 'Pillow 16x16', width: 4800, height: 4800, dpi: 300, category: 'workshop', subcategory: 'Home Decor', aspectRatio: '1:1', description: '16 x 16 inches' },
  { id: 'pillow-18x18', name: 'Pillow 18x18', width: 5400, height: 5400, dpi: 300, category: 'workshop', subcategory: 'Home Decor', aspectRatio: '1:1', description: '18 x 18 inches' },
  { id: 'blanket-50x60', name: 'Throw Blanket 50x60', width: 15000, height: 18000, dpi: 300, category: 'workshop', subcategory: 'Home Decor', aspectRatio: '5:6', description: '50 x 60 inches' },
  { id: 'wall-art-12x16', name: 'Wall Art 12x16', width: 3600, height: 4800, dpi: 300, category: 'workshop', subcategory: 'Home Decor', aspectRatio: '3:4', description: 'Standard frame size' },
  { id: 'wall-art-16x20', name: 'Wall Art 16x20', width: 4800, height: 6000, dpi: 300, category: 'workshop', subcategory: 'Home Decor', aspectRatio: '4:5', description: 'Standard frame size' },
  { id: 'wall-art-18x24', name: 'Wall Art 18x24', width: 5400, height: 7200, dpi: 300, category: 'workshop', subcategory: 'Home Decor', aspectRatio: '3:4', description: 'Standard frame size' },
  { id: 'wall-art-24x36', name: 'Wall Art 24x36', width: 7200, height: 10800, dpi: 300, category: 'workshop', subcategory: 'Home Decor', aspectRatio: '2:3', description: 'Large poster frame' },
  
  // Laser Cutting / Engraving
  { id: 'laser-wood-12x12', name: 'Wood Sheet 12x12 in', width: 3600, height: 3600, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '1:1', description: 'Standard wood/acrylic sheet' },
  { id: 'laser-wood-12x20', name: 'Wood Sheet 12x20 in', width: 3600, height: 6000, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '3:5', description: 'Standard wood/acrylic sheet' },
  { id: 'laser-wood-20x12', name: 'Wood Sheet 20x12 in', width: 6000, height: 3600, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '5:3', description: 'Standard wood/acrylic sheet' },
  { id: 'laser-wood-24x12', name: 'Wood Sheet 24x12 in', width: 7200, height: 3600, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '2:1', description: 'Large wood/acrylic sheet' },
  { id: 'laser-wood-24x24', name: 'Wood Sheet 24x24 in', width: 7200, height: 7200, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '1:1', description: 'Large square sheet' },
  { id: 'laser-wood-60x40cm', name: 'Wood Sheet 60x40 cm', width: 7087, height: 4724, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '3:2', description: 'Metric standard (600x400mm)' },
  { id: 'laser-wood-40x30cm', name: 'Wood Sheet 40x30 cm', width: 4724, height: 3543, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '4:3', description: 'Metric standard (400x300mm)' },
  
  // Laser Specific Items
  { id: 'desk-plaque', name: 'Desk Plaque', width: 2400, height: 600, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '4:1', description: '8 x 2 inches name plaque' },
  { id: 'medal-round', name: 'Round Medal', width: 1200, height: 1200, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '1:1', description: '4 inch diameter' },
  { id: 'medal-rect', name: 'Rectangular Medal', width: 1800, height: 1200, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '3:2', description: '6 x 4 inches' },
  { id: 'keychain-round', name: 'Round Keychain', width: 600, height: 600, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '1:1', description: '2 inch diameter' },
  { id: 'keychain-rect', name: 'Rectangular Keychain', width: 900, height: 600, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '3:2', description: '3 x 2 inches' },
  { id: 'coaster-round', name: 'Round Coaster', width: 1200, height: 1200, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '1:1', description: '4 inch diameter' },
  { id: 'coaster-square', name: 'Square Coaster', width: 1200, height: 1200, dpi: 300, category: 'workshop', subcategory: 'Laser/CNC', aspectRatio: '1:1', description: '4 x 4 inches' },
  
  // Phone Cases
  { id: 'phone-case-iphone', name: 'iPhone Case', width: 2400, height: 4800, dpi: 300, category: 'workshop', subcategory: 'Phone Cases', aspectRatio: '1:2', description: 'Full wrap template' },
  { id: 'phone-case-android', name: 'Android Case', width: 2520, height: 4800, dpi: 300, category: 'workshop', subcategory: 'Phone Cases', aspectRatio: '21:40', description: 'Full wrap template' },
  
  // Acrylic LED Night Light
  { id: 'acrylic-night-light-base', name: 'Acrylic LED Night Light Base', width: 2400, height: 2400, dpi: 300, category: 'workshop', subcategory: 'Acrylic LED', aspectRatio: '1:1', description: '8 x 8 inches acrylic insert' },
  { id: 'acrylic-night-light-rect', name: 'Acrylic LED Night Light Rect', width: 3000, height: 2400, dpi: 300, category: 'workshop', subcategory: 'Acrylic LED', aspectRatio: '5:4', description: '10 x 8 inches acrylic insert' },
  
  // Wall Clock
  { id: 'wall-clock-12in', name: 'Wall Clock 12in', width: 3600, height: 3600, dpi: 300, category: 'workshop', subcategory: 'Home Decor', aspectRatio: '1:1', description: '12 inch diameter clock face' },
  { id: 'wall-clock-14in', name: 'Wall Clock 14in', width: 4200, height: 4200, dpi: 300, category: 'workshop', subcategory: 'Home Decor', aspectRatio: '1:1', description: '14 inch diameter clock face' },
]

// ============================================
// ALL PRESETS COMBINED
// ============================================
export const ALL_CANVAS_PRESETS: CanvasPreset[] = [
  ...SOCIAL_PRESETS,
  ...PRINT_PRESETS,
  ...WORKSHOP_PRESETS,
]

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getPresetsByCategory(category: CanvasPreset['category']): CanvasPreset[] {
  return ALL_CANVAS_PRESETS.filter(p => p.category === category)
}

export function getPresetsBySubcategory(subcategory: string): CanvasPreset[] {
  return ALL_CANVAS_PRESETS.filter(p => p.subcategory === subcategory)
}

export function getSubcategories(category: CanvasPreset['category']): string[] {
  const presets = getPresetsByCategory(category)
  return [...new Set(presets.map(p => p.subcategory).filter(Boolean) as string[])].sort()
}

export function getPreset(id: string): CanvasPreset | undefined {
  return ALL_CANVAS_PRESETS.find(p => p.id === id)
}

/** Convert inches to pixels at given DPI */
export function inchesToPixels(inches: number, dpi: number = 300): number {
  return Math.round(inches * dpi)
}

/** Convert mm to pixels at given DPI */
export function mmToPixels(mm: number, dpi: number = 300): number {
  return Math.round((mm / 25.4) * dpi)
}

/** Convert cm to pixels at given DPI */
export function cmToPixels(cm: number, dpi: number = 300): number {
  return Math.round((cm / 2.54) * dpi)
}

/** Get aspect ratio string from width/height */
export function getAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}