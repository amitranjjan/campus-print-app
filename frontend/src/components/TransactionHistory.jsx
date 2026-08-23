import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { formatCurrency } from '../utils/calculators'
import toast from 'react-hot-toast'
import {
  HiOutlineClipboardDocument,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineXCircle,
  HiOutlineDocumentArrowDown,
  HiOutlineDocumentText,
  HiOutlineArrowPath,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineTrash,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2'
import { FiPrinter, FiShoppingBag, FiX } from 'react-icons/fi'

export default function TransactionHistory({ onNewOrderClick }) {
  const [historyJobs, setHistoryJobs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedTokens, setExpandedTokens] = useState({})
  const [filter, setFilter] = useState('all') // 'all' | 'paid' | 'offline' | 'pending' | 'completed' | 'cancelled'
  const [cancelModalJob, setCancelModalJob] = useState(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const fetchHistory = useCallback(async (showToast = false) => {
    setIsLoading(true)
    try {
      const res = await api.get('/api/jobs/my-history')
      setHistoryJobs(res.data || [])
      if (showToast) {
        toast.success('History refreshed!')
      }
    } catch (err) {
      console.error('Failed to fetch transaction history:', err)
      toast.error('Failed to load transaction history')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const copyToClipboard = (token) => {
    navigator.clipboard.writeText(token)
    toast.success(`Token #${token} copied to clipboard!`)
  }

  const toggleExpand = (token) => {
    setExpandedTokens((prev) => ({
      ...prev,
      [token]: !prev[token],
    }))
  }

  const handleDownload = (url, label) => {
    if (!url) {
      toast.error(`${label} not available`)
      return
    }
    window.open(url, '_blank')
  }

  const formatDate = (isoString) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Handle order cancellation
  const confirmCancelOrder = async () => {
    if (!cancelModalJob) return
    const token = cancelModalJob.token
    setIsCancelling(true)

    try {
      await api.patch(`/api/jobs/${token}/cancel`)
      toast.success(`Order #${token} has been cancelled`)

      // Update local state
      setHistoryJobs((prev) =>
        prev.map((j) =>
          j.token === token
            ? { ...j, status: 'cancelled', cancelledAt: new Date().toISOString() }
            : j
        )
      )
      setCancelModalJob(null)
    } catch (err) {
      console.error('Cancellation error:', err)
      toast.error(err.response?.data?.detail || 'Failed to cancel order')
    } finally {
      setIsCancelling(false)
    }
  }

  // Statistics
  const totalSpent = historyJobs
    .filter((j) => j.paymentStatus === 'paid' && j.status !== 'cancelled')
    .reduce((sum, j) => sum + (j.totalCost || 0), 0)
  const totalOrders = historyJobs.length
  const completedOrders = historyJobs.filter((j) => j.status === 'completed').length
  const pendingOrders = historyJobs.filter((j) => j.status === 'pending').length
  const cancelledOrders = historyJobs.filter((j) => j.status === 'cancelled').length

  const filteredJobs = historyJobs.filter((job) => {
    if (filter === 'paid') return job.paymentStatus === 'paid' && job.status !== 'cancelled'
    if (filter === 'offline') return job.paymentStatus !== 'paid' && job.status !== 'cancelled'
    if (filter === 'completed') return job.status === 'completed'
    if (filter === 'pending') return job.status === 'pending'
    if (filter === 'cancelled') return job.status === 'cancelled'
    return true
  })

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Header & Stats Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            My Orders & Transaction History
          </h2>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            View your tokens, payment receipts, track print status, or cancel active orders
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fetchHistory(true)}
          disabled={isLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          <HiOutlineArrowPath className={isLoading ? 'spin' : ''} size={16} />
          Refresh Status
        </button>
      </div>

      {/* Summary Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div className="card" style={{ padding: '12px 16px', backgroundColor: '#ffffff' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Orders
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-primary)', marginTop: 4 }}>
            {totalOrders}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', backgroundColor: '#ffffff' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>
            Paid Online
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
            {formatCurrency(totalSpent)}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', backgroundColor: '#ffffff' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>
            Active / Queue
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#3b82f6', marginTop: 4 }}>
            {pendingOrders}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', backgroundColor: '#ffffff' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>
            Completed
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>
            {completedOrders}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', backgroundColor: '#ffffff' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600, textTransform: 'uppercase' }}>
            Cancelled
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>
            {cancelledOrders}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button
          type="button"
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('all')}
          style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8 }}
        >
          All ({totalOrders})
        </button>
        <button
          type="button"
          className={`btn ${filter === 'paid' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('paid')}
          style={{
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 8,
            backgroundColor: filter === 'paid' ? '#059669' : undefined,
          }}
        >
          💳 Paid Online ({historyJobs.filter((j) => j.paymentStatus === 'paid' && j.status !== 'cancelled').length})
        </button>
        <button
          type="button"
          className={`btn ${filter === 'offline' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('offline')}
          style={{
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 8,
            backgroundColor: filter === 'offline' ? '#d97706' : undefined,
          }}
        >
          💵 Pay at Counter ({historyJobs.filter((j) => j.paymentStatus !== 'paid' && j.status !== 'cancelled').length})
        </button>
        <button
          type="button"
          className={`btn ${filter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('pending')}
          style={{
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 8,
            backgroundColor: filter === 'pending' ? '#2563eb' : undefined,
          }}
        >
          ⏳ In Queue ({pendingOrders})
        </button>
        <button
          type="button"
          className={`btn ${filter === 'completed' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('completed')}
          style={{
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 8,
            backgroundColor: filter === 'completed' ? '#047857' : undefined,
          }}
        >
          ✓ Completed ({completedOrders})
        </button>
        {cancelledOrders > 0 && (
          <button
            type="button"
            className={`btn ${filter === 'cancelled' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('cancelled')}
            style={{
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 8,
              backgroundColor: filter === 'cancelled' ? '#dc2626' : undefined,
            }}
          >
            🚫 Cancelled ({cancelledOrders})
          </button>
        )}
      </div>

      {/* Orders List */}
      {filteredJobs.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredJobs.map((job) => {
            const isPaid = job.paymentStatus === 'paid'
            const isCompleted = job.status === 'completed'
            const isCancelled = job.status === 'cancelled'
            const isPending = job.status === 'pending'
            const isExpanded = !!expandedTokens[job.token]

            return (
              <div
                key={job.token}
                className="card"
                style={{
                  borderLeft: isCancelled
                    ? '6px solid #ef4444'
                    : isPaid
                    ? '6px solid #10b981'
                    : '6px solid #f59e0b',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  backgroundColor: isCancelled ? '#fafafa' : '#ffffff',
                  opacity: isCancelled ? 0.88 : 1,
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          letterSpacing: 2,
                          fontFamily: 'monospace',
                          color: isCancelled ? '#9ca3af' : 'var(--color-text)',
                          backgroundColor: 'var(--color-bg-subtle, rgba(0,0,0,0.04))',
                          padding: '4px 10px',
                          borderRadius: 8,
                          textDecoration: isCancelled ? 'line-through' : 'none',
                        }}
                      >
                        #{job.token}
                      </span>

                      {!isCancelled && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(job.token)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                          title="Copy token to clipboard"
                        >
                          <HiOutlineClipboardDocument size={14} />
                          Copy Token
                        </button>
                      )}

                      {/* Payment Status Tag */}
                      {isPaid ? (
                        <span
                          style={{
                            backgroundColor: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981' }} />
                          PAID ONLINE
                        </span>
                      ) : (
                        <span
                          style={{
                            backgroundColor: '#fffbeb',
                            color: '#92400e',
                            border: '1px solid #fde68a',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          💵 PAY AT COUNTER
                        </span>
                      )}

                      {/* Job Status Tag */}
                      {isCancelled ? (
                        <span
                          style={{
                            backgroundColor: '#fef2f2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <HiOutlineXCircle size={14} /> CANCELLED
                        </span>
                      ) : isCompleted ? (
                        <span
                          style={{
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <HiOutlineCheckCircle color="#10b981" size={14} /> Printed & Completed
                        </span>
                      ) : (
                        <span
                          style={{
                            backgroundColor: '#eff6ff',
                            color: '#1e40af',
                            border: '1px solid #bfdbfe',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <HiOutlineClock size={14} /> In Print Queue
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <HiOutlineClock size={13} /> {formatDate(job.createdAt)}
                    </div>
                  </div>

                  {/* Total Cost Display & Cancel Action */}
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-light)', textTransform: 'uppercase' }}>
                        {isCancelled ? 'Cancelled Amount' : isPaid ? 'Amount Paid' : 'Due at Counter'}
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: isCancelled ? '#9ca3af' : 'var(--color-primary)',
                          textDecoration: isCancelled ? 'line-through' : 'none',
                        }}
                      >
                        {formatCurrency(job.totalCost || 0)}
                      </div>
                    </div>

                    {/* CANCEL ORDER BUTTON (Active pending jobs only) */}
                    {isPending && (
                      <button
                        type="button"
                        onClick={() => setCancelModalJob(job)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#dc2626',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          padding: '4px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        title="Cancel this active print order"
                      >
                        <HiOutlineTrash size={14} />
                        Cancel Order
                      </button>
                    )}
                  </div>
                </div>

                {/* Details Bar */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 8,
                    backgroundColor: isCancelled ? 'rgba(0,0,0,0.02)' : 'var(--color-bg-subtle, rgba(0,0,0,0.02))',
                    padding: '10px 14px',
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--color-text-light)' }}>Documents: </span>
                    <strong>{job.totalFiles || job.files?.length || 1} file(s)</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-light)' }}>Total Pages: </span>
                    <strong>{job.totalPages} pages</strong>
                  </div>
                  {job.razorpayPaymentId && (
                    <div>
                      <span style={{ color: 'var(--color-text-light)' }}>Txn ID: </span>
                      <strong style={{ fontFamily: 'monospace' }}>{job.razorpayPaymentId}</strong>
                    </div>
                  )}
                </div>

                {/* Document details toggle */}
                <div>
                  <button
                    type="button"
                    onClick={() => toggleExpand(job.token)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {isExpanded ? <HiOutlineChevronUp size={15} /> : <HiOutlineChevronDown size={15} />}
                    {isExpanded ? 'Hide' : 'View'} Document Details ({job.files?.length || 1} file{job.files?.length !== 1 ? 's' : ''})
                  </button>

                  {isExpanded && job.files && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {job.files.map((fileItem, idx) => (
                        <div
                          key={idx}
                          style={{
                            border: '1px solid var(--color-border, #e5e7eb)',
                            borderRadius: 8,
                            padding: 10,
                            backgroundColor: isCancelled ? '#ffffff' : '#f9fafb',
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600 }}>
                              #{idx + 1} {fileItem.filename}
                            </span>
                            <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                              {formatCurrency(fileItem.fileCost || 0)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                            <span>{fileItem.totalPages} pg</span>
                            <span>Size: <strong>{fileItem.paperSize}</strong></span>
                            <span>Copies: <strong>{fileItem.copies}</strong></span>
                            <span>B&W: <strong>{fileItem.bwDoubleSided ? 'Double-sided' : 'Single-sided'}</strong></span>
                            {fileItem.colorPages?.length > 0 && (
                              <span>Color: <strong>{fileItem.colorDoubleSided ? 'Double-sided' : 'Single-sided'}</strong> (pg {fileItem.colorPages.join(', ')})</span>
                            )}
                            {fileItem.binding && <span>Binding: <strong>Yes</strong></span>}
                          </div>

                          {!isCancelled && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {fileItem.colorFileUrl && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleDownload(fileItem.colorFileUrl, `${fileItem.filename} Color`)}
                                  style={{ fontSize: 11, padding: '3px 8px' }}
                                >
                                  <FiPrinter size={12} /> Color PDF
                                </button>
                              )}
                              {fileItem.bwFileUrl && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleDownload(fileItem.bwFileUrl, `${fileItem.filename} B&W`)}
                                  style={{ fontSize: 11, padding: '3px 8px' }}
                                >
                                  <HiOutlineDocumentArrowDown size={12} /> B&W PDF
                                </button>
                              )}
                              {fileItem.originalFileUrl && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleDownload(fileItem.originalFileUrl, `${fileItem.filename} Original`)}
                                  style={{ fontSize: 11, padding: '3px 8px' }}
                                >
                                  <HiOutlineDocumentText size={12} /> Original PDF
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            border: '2px dashed var(--color-border, #e5e7eb)',
            backgroundColor: '#ffffff',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: '#eff6ff',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              margin: '0 auto 14px',
            }}
          >
            <FiShoppingBag />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
            {filter === 'all' ? 'No print orders yet' : `No ${filter} print orders`}
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, maxWidth: 380, margin: '0 auto 18px' }}>
            Upload and submit your PDF files to get started. All your tokens and receipts will be saved right here.
          </p>
          {onNewOrderClick && (
            <button type="button" className="btn btn-primary" onClick={onNewOrderClick}>
              Create New Print Job
            </button>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* ORDER CANCELLATION CONFIRMATION MODAL */}
      {/* ────────────────────────────────────────────────────────── */}
      {cancelModalJob && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 440,
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: 14,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: 24,
              animation: 'modalSlideIn 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: '#fee2e2',
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                  }}
                >
                  <HiOutlineExclamationTriangle />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                  Cancel Print Order?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCancelModalJob(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}
              >
                <FiX size={18} />
              </button>
            </div>

            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
              Are you sure you want to cancel order{' '}
              <strong style={{ color: 'var(--color-text)' }}>#{cancelModalJob.token}</strong>? This will remove your document from the print queue immediately.
            </p>

            <div
              style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 13,
                marginBottom: 18,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Amount:</span>
                <strong>{formatCurrency(cancelModalJob.totalCost || 0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Payment Mode:</span>
                <strong>{cancelModalJob.paymentStatus === 'paid' ? 'Paid Online (Razorpay)' : 'Pay at Counter'}</strong>
              </div>
              {cancelModalJob.paymentStatus === 'paid' && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e5e7eb', fontSize: 12, color: '#b45309' }}>
                  ℹ️ For online paid orders, show token <strong>#{cancelModalJob.token}</strong> at the Xerox counter for an instant refund.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCancelModalJob(null)}
                disabled={isCancelling}
                style={{ flex: 1 }}
              >
                Keep Order
              </button>
              <button
                type="button"
                className="btn"
                onClick={confirmCancelOrder}
                disabled={isCancelling}
                style={{
                  flex: 1,
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
