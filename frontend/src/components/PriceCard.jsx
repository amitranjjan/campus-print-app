import { calculateMultiFileJobPrice, formatCurrency } from '../utils/calculators'

/**
 * Displays a live price breakdown for single or multi-file print jobs.
 *
 * Props:
 *   fileItems - Array of file item objects with settings:
 *               [{ id, file, totalPages, colorPagesInput, paperSize, colorDoubleSided, bwDoubleSided, binding, copies }]
 */
export default function PriceCard({ fileItems = [] }) {
  if (!fileItems || fileItems.length === 0) {
    return null
  }

  const { filesBreakdown, grandTotal, totalPages, totalSheets } =
    calculateMultiFileJobPrice(fileItems)

  const isMultiFile = filesBreakdown.length > 1

  return (
    <div className="price-card">
      <div className="price-card-title">
        Price Breakdown ({filesBreakdown.length} {filesBreakdown.length === 1 ? 'Document' : 'Documents'})
      </div>

      {filesBreakdown.map((item, idx) => {
        const { pricing, paperSize, colorPages, colorPageCount, bwPageCount, colorDoubleSided, bwDoubleSided, binding, copies } = item

        return (
          <div
            key={item.id || idx}
            style={
              isMultiFile
                ? {
                    backgroundColor: 'var(--color-bg-subtle, rgba(0,0,0,0.02))',
                    borderRadius: 8,
                    padding: '10px 12px',
                    marginBottom: 10,
                    border: '1px solid var(--color-border, #e5e7eb)',
                  }
                : {}
            }
          >
            {isMultiFile && (
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: 'var(--color-text)',
                  marginBottom: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                  <span style={{ color: 'var(--color-primary)', marginRight: 4 }}>#{idx + 1}</span>
                  {item.filename}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 500 }}>
                  ({paperSize})
                </span>
              </div>
            )}

            {colorPageCount > 0 && (
              <div className="price-row" style={{ fontSize: 12 }}>
                <span className="price-row-label">
                  Color × {colorPageCount} pg × {formatCurrency(paperSize === 'A3' ? 15 : 10)}
                  {colorDoubleSided ? ' (2-sided)' : ' (1-sided)'}
                </span>
                <span className="price-row-value">{formatCurrency(pricing.colorCost)}</span>
              </div>
            )}

            {bwPageCount > 0 && (
              <div className="price-row" style={{ fontSize: 12 }}>
                <span className="price-row-label">
                  B&W × {bwDoubleSided ? `${pricing.bwSheets} sheet${pricing.bwSheets !== 1 ? 's' : ''} (2-sided)` : `${bwPageCount} pg (1-sided)`} × {formatCurrency(bwDoubleSided ? (paperSize === 'A3' ? 8 : 2) : (paperSize === 'A3' ? 4 : 2))}
                </span>
                <span className="price-row-value">{formatCurrency(pricing.bwCost)}</span>
              </div>
            )}

            {binding && (
              <div className="price-row" style={{ fontSize: 12 }}>
                <span className="price-row-label">Binding</span>
                <span className="price-row-value">{formatCurrency(pricing.bindingCost)}</span>
              </div>
            )}

            {copies > 1 && (
              <div className="price-row" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <span className="price-row-label">× {copies} copies</span>
                <span className="price-row-value">{formatCurrency(pricing.total)}</span>
              </div>
            )}

            {isMultiFile && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 600,
                  fontSize: 12,
                  marginTop: 4,
                  paddingTop: 4,
                  borderTop: '1px dashed var(--color-border, #e5e7eb)',
                }}
              >
                <span>Subtotal ({item.totalPages} pg)</span>
                <span>{formatCurrency(pricing.total)}</span>
              </div>
            )}
          </div>
        )
      })}

      <hr className="price-divider" />

      {/* Summary stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        <span>Total Document Pages:</span>
        <span style={{ fontWeight: 600 }}>{totalPages}</span>
      </div>

      <div className="price-total">
        <span className="price-total-label">Grand Total</span>
        <span className="price-total-value">{formatCurrency(grandTotal)}</span>
      </div>
    </div>
  )
}
