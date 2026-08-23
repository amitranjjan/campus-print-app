/**
 * Parse a page range string like "1-5, 8, 10-12" into an array of page numbers.
 * Validates against totalPages to prevent out-of-range values.
 *
 * @param {string} rangeStr - Comma-separated page ranges (e.g., "1-5, 8, 10-12")
 * @param {number} totalPages - Total number of pages in the document
 * @returns {number[]} Sorted array of unique page numbers
 */
export function parsePageRanges(rangeStr, totalPages) {
  if (!rangeStr || !rangeStr.trim()) return []

  const pages = new Set()
  const parts = rangeStr.split(',').map((s) => s.trim()).filter(Boolean)

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-')
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
          pages.add(i)
        }
      }
    } else {
      const page = parseInt(part, 10)
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        pages.add(page)
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b)
}

/**
 * Pricing table:
 *
 *   | Paper | Type  | Single-sided | Double-sided |
 *   |-------|-------|-------------|-------------|
 *   | A4    | Color | Rs.10/page   | Rs.20/page   |
 *   | A4    | B&W   | Rs.2/page    | Rs.2/page    |
 *   | A3    | Color | Rs.15/page   | Rs.30/page   |
 *   | A3    | B&W   | Rs.4/page    | Rs.8/page    |
 *
 *   Binding: +Rs.20 flat (per copy)
 */

const RATES = {
  A4: { color: { single: 10, double: 20 }, bw: { single: 2, double: 2 } },
  A3: { color: { single: 15, double: 30 }, bw: { single: 4, double: 8 } },
}

/**
 * Calculate print job price.
 *
 * @param {object} params
 * @param {number} params.colorPageCount - Number of color pages
 * @param {number} params.bwPageCount - Number of B&W pages
 * @param {string} params.paperSize - "A4" or "A3"
 * @param {boolean} params.colorDoubleSided - Double-sided for color pages
 * @param {boolean} params.bwDoubleSided - Double-sided for B&W pages
 * @param {boolean} params.binding - Whether binding is requested
 * @param {number} params.copies - Number of copies
 * @returns {{ colorCost, bwCost, bindingCost, subtotal, total }}
 */
export function calculatePrice({
  colorPageCount,
  bwPageCount,
  paperSize = 'A4',
  colorDoubleSided = false,
  bwDoubleSided = false,
  binding = false,
  copies = 1,
}) {
  const rates = RATES[paperSize] || RATES.A4

  const colorRate = colorDoubleSided ? rates.color.double : rates.color.single
  const bwRate = bwDoubleSided ? rates.bw.double : rates.bw.single

  // Double-sided → 2 pages per sheet, so sheets = ceil(pages / 2)
  const colorSheets = colorDoubleSided ? Math.ceil(colorPageCount / 2) : colorPageCount
  const bwSheets = bwDoubleSided ? Math.ceil(bwPageCount / 2) : bwPageCount

  const colorCost = colorSheets * colorRate
  const bwCost = bwSheets * bwRate
  const bindingCost = binding ? 20 : 0
  const subtotal = colorCost + bwCost + bindingCost
  const total = subtotal * copies

  return { colorCost, bwCost, bindingCost, subtotal, total, colorRate, bwRate, colorSheets, bwSheets }
}

/**
 * Calculate pricing for a multi-file print job.
 *
 * @param {Array} fileItems - Array of file item objects with their print settings
 * @returns {{ filesBreakdown: Array, grandTotal: number, totalPages: number, totalSheets: number }}
 */
export function calculateMultiFileJobPrice(fileItems = []) {
  let grandTotal = 0
  let totalPages = 0
  let totalSheets = 0

  const filesBreakdown = fileItems.map((item) => {
    const colorPages = parsePageRanges(item.colorPagesInput, item.totalPages)
    const colorPageCount = colorPages.length
    const bwPageCount = Math.max(0, item.totalPages - colorPageCount)

    const pricing = calculatePrice({
      colorPageCount,
      bwPageCount,
      paperSize: item.paperSize || 'A4',
      colorDoubleSided: item.colorDoubleSided || false,
      bwDoubleSided: item.bwDoubleSided || false,
      binding: item.binding || false,
      copies: item.copies || 1,
    })

    grandTotal += pricing.total
    totalPages += item.totalPages * (item.copies || 1)
    totalSheets += (pricing.colorSheets + pricing.bwSheets) * (item.copies || 1)

    return {
      id: item.id,
      filename: item.file?.name || 'document.pdf',
      totalPages: item.totalPages,
      colorPages,
      colorPageCount,
      bwPageCount,
      paperSize: item.paperSize || 'A4',
      colorDoubleSided: item.colorDoubleSided || false,
      bwDoubleSided: item.bwDoubleSided || false,
      binding: item.binding || false,
      copies: item.copies || 1,
      pricing,
    }
  })

  return {
    filesBreakdown,
    grandTotal,
    totalPages,
    totalSheets,
  }
}

/**
 * Format a number as Indian Rupee currency string.
 *
 * @param {number} amount
 * @returns {string} Formatted string like "Rs.120"
 */
export function formatCurrency(amount) {
  return `Rs.${amount.toLocaleString('en-IN')}`
}
