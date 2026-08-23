import { useState, useEffect, useCallback } from 'react'
import Navbar from '../components/Navbar'
import api from '../services/api'
import { formatCurrency } from '../utils/calculators'
import toast from 'react-hot-toast'
import {
  HiOutlineMagnifyingGlass,
  HiOutlineDocumentArrowDown,
  HiOutlineCheckCircle,
  HiOutlineDocumentText,
  HiOutlineArrowPath,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
} from 'react-icons/hi2'
import { FiPrinter, FiSearch, FiFileText, FiClock, FiCheck } from 'react-icons/fi'

export default function AdminView() {
  // Live Queue State
  const [queueJobs, setQueueJobs] = useState([])
  const [isLoadingQueue, setIsLoadingQueue] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedJobTokens, setExpandedJobTokens] = useState({})

  // Token Search State
  const [searchToken, setSearchToken] = useState('')
  const [searchedJob, setSearchedJob] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [completingTokens, setCompletingTokens] = useState({})

  // Queue Filter Tab ('all', 'paid', 'offline')
  const [filterTab, setFilterTab] = useState('all')

  const filteredQueue = queueJobs.filter((job) => {
    if (filterTab === 'paid') return job.paymentStatus === 'paid'
    if (filterTab === 'offline') return job.paymentStatus !== 'paid'
    return true
  })

  const paidCount = queueJobs.filter((j) => j.paymentStatus === 'paid').length
  const offlineCount = queueJobs.filter((j) => j.paymentStatus !== 'paid').length

  // Fetch Live Queue
  const fetchQueue = useCallback(async (showToast = false) => {
    setIsLoadingQueue(true)
    try {
      const res = await api.get('/api/jobs/queue')
      setQueueJobs(res.data || [])
      if (showToast) {
        toast.success('Queue refreshed!')
      }
    } catch (err) {
      console.error('Failed to fetch print queue:', err)
      if (showToast) {
        toast.error('Failed to refresh print queue')
      }
    } finally {
      setIsLoadingQueue(false)
    }
  }, [])

  // Auto-polling for incoming jobs every 7 seconds
  useEffect(() => {
    fetchQueue()

    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchQueue()
    }, 7000)

    return () => clearInterval(interval)
  }, [autoRefresh, fetchQueue])

  // Search by token
  const handleSearch = async (e) => {
    e?.preventDefault()
    const token = searchToken.trim()
    if (!token) {
      toast.error('Please enter a token')
      return
    }

    setIsSearching(true)
    setSearchedJob(null)
    setSearched(true)

    try {
      const res = await api.get(`/api/jobs/${token}`)
      setSearchedJob(res.data)
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error('No job found for this token')
      } else {
        toast.error('Failed to fetch job details')
      }
    } finally {
      setIsSearching(false)
    }
  }

  // Mark job as completed
  const handleMarkComplete = async (token) => {
    setCompletingTokens((prev) => ({ ...prev, [token]: true }))
    try {
      await api.patch(`/api/jobs/${token}/complete`)
      toast.success(`Job #${token} marked as completed!`)

      // Remove from live queue immediately
      setQueueJobs((prev) => prev.filter((j) => j.token !== token))

      // If viewing in search result, update status
      if (searchedJob && searchedJob.token === token) {
        setSearchedJob((prev) => ({ ...prev, status: 'completed' }))
      }
    } catch (err) {
      console.error('Complete job error:', err)
      toast.error('Failed to mark job as completed')
    } finally {
      setCompletingTokens((prev) => ({ ...prev, [token]: false }))
    }
  }

  const handleDownload = (url, label) => {
    if (!url) {
      toast.error(`${label} file not available`)
      return
    }
    window.open(url, '_blank')
  }

  const toggleExpand = (token) => {
    setExpandedJobTokens((prev) => ({
      ...prev,
      [token]: !prev[token],
    }))
  }

  const formatTime = (isoString) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      <Navbar />
      <div className="page-container" style={{ maxWidth: 1040 }}>
        {/* Header with Live Stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Admin Print Station</h1>
            <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
              Real-time incoming print orders & one-click master printing
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fetchQueue(true)}
              disabled={isLoadingQueue}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <HiOutlineArrowPath className={isLoadingQueue ? 'spin' : ''} size={16} />
              Refresh
            </button>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                cursor: 'pointer',
                backgroundColor: 'var(--color-bg-subtle, rgba(0,0,0,0.03))',
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border, #e5e7eb)',
              }}
            >
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>Auto-refresh (7s)</span>
              {autoRefresh && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 8px #10b981',
                  }}
                />
              )}
            </label>
          </div>
        </div>

        {/* Token Search Bar */}
        <div className="admin-search-section" style={{ marginBottom: 28 }}>
          <form onSubmit={handleSearch} className="admin-search-wrapper">
            <input
              type="text"
              className="admin-search-input"
              placeholder="Search by 5-digit token to find any job..."
              value={searchToken}
              onChange={(e) => setSearchToken(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={5}
            />
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={isSearching || !searchToken.trim()}
            >
              {isSearching ? (
                <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
              ) : (
                <FiSearch size={20} />
              )}
            </button>
          </form>
        </div>

        {/* Direct Searched Job Result (if active) */}
        {searchedJob && (
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-primary)' }}>
                Search Result for Token #{searchedJob.token}
              </h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearchedJob(null)
                  setSearched(false)
                  setSearchToken('')
                }}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                Clear Search Result
              </button>
            </div>
            {renderJobCard(searchedJob, completingTokens, handleMarkComplete, handleDownload, expandedJobTokens, toggleExpand, formatTime)}
          </div>
        )}

        {/* Searched Not Found */}
        {!searchedJob && searched && !isSearching && (
          <div className="empty-state" style={{ padding: '24px 16px', marginBottom: 28 }}>
            <div className="empty-state-icon" style={{ fontSize: 32 }}>
              <HiOutlineMagnifyingGlass />
            </div>
            <h4>No job found for token "{searchToken}"</h4>
            <p>Please check the token and try again</p>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* LIVE PRINT QUEUE FEED */}
        {/* ────────────────────────────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: queueJobs.length > 0 ? '#10b981' : '#9ca3af',
                  boxShadow: queueJobs.length > 0 ? '0 0 10px #10b981' : 'none',
                }}
              />
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Live Incoming Print Queue
              </h2>
              <span
                style={{
                  backgroundColor: queueJobs.length > 0 ? 'var(--color-primary)' : '#e5e7eb',
                  color: queueJobs.length > 0 ? '#ffffff' : '#6b7280',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: 12,
                }}
              >
                {queueJobs.length} Total
              </span>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: 6, backgroundColor: 'var(--color-bg-subtle, rgba(0,0,0,0.04))', padding: 4, borderRadius: 8 }}>
              <button
                type="button"
                className={`btn ${filterTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterTab('all')}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6 }}
              >
                All ({queueJobs.length})
              </button>
              <button
                type="button"
                className={`btn ${filterTab === 'paid' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterTab('paid')}
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 6,
                  backgroundColor: filterTab === 'paid' ? '#059669' : undefined,
                }}
              >
                ⚡ Paid First ({paidCount})
              </button>
              <button
                type="button"
                className={`btn ${filterTab === 'offline' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterTab('offline')}
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 6,
                  backgroundColor: filterTab === 'offline' ? '#d97706' : undefined,
                }}
              >
                💵 Pay at Counter ({offlineCount})
              </button>
            </div>
          </div>

          {/* Queue List */}
          {filteredQueue.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {filteredQueue.map((job, idx) =>
                renderJobCard(
                  job,
                  completingTokens,
                  handleMarkComplete,
                  handleDownload,
                  expandedJobTokens,
                  toggleExpand,
                  formatTime,
                  idx + 1
                )
              )}
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
                  backgroundColor: '#f0fdf4',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  margin: '0 auto 14px',
                }}
              >
                <FiCheck />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
                {filterTab === 'all'
                  ? 'All caught up! Print queue is clear.'
                  : `No ${filterTab === 'paid' ? 'paid online' : 'counter cash'} print jobs pending.`}
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, maxWidth: 420, margin: '0 auto' }}>
                When students submit jobs on the website, they will appear right here in priority order (online paid jobs first!).
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * Reusable Job Card Component for both Queue and Search results
 */
function renderJobCard(
  job,
  completingTokens,
  handleMarkComplete,
  handleDownload,
  expandedJobTokens,
  toggleExpand,
  formatTime,
  queuePosition = null
) {
  const isExpanded = !!expandedJobTokens[job.token]
  const isCompleting = !!completingTokens[job.token]
  const isPaid = job.paymentStatus === 'paid'

  return (
    <div
      key={job.token}
      className="card"
      style={{
        borderLeft: isPaid ? '6px solid #10b981' : '6px solid #f59e0b',
        boxShadow: isPaid ? '0 4px 14px rgba(16, 185, 129, 0.12)' : '0 4px 12px rgba(0,0,0,0.06)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Top row: Queue Position, Token, Payment Status, Student info, Complete button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {queuePosition && (
              <span
                style={{
                  backgroundColor: isPaid ? '#059669' : '#d97706',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 12,
                  padding: '4px 8px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {isPaid ? '⚡ #' + queuePosition : '#' + queuePosition}
              </span>
            )}

            <span
              style={{
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: 2,
                color: 'var(--color-text)',
                fontFamily: 'monospace',
                backgroundColor: 'var(--color-bg-subtle, rgba(0,0,0,0.04))',
                padding: '4px 12px',
                borderRadius: 8,
              }}
            >
              #{job.token}
            </span>

            {/* Payment badge */}
            {isPaid ? (
              <span
                style={{
                  backgroundColor: '#ecfdf5',
                  color: '#065f46',
                  border: '1px solid #a7f3d0',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981' }} />
                PAID ONLINE ({formatCurrency(job.totalCost)})
              </span>
            ) : (
              <span
                style={{
                  backgroundColor: '#fffbeb',
                  color: '#92400e',
                  border: '1px solid #fde68a',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 6,
                }}
              >
                💵 Pay at Counter ({formatCurrency(job.totalCost)})
              </span>
            )}

            {job.paidAt ? (
              <span style={{ fontSize: 12, color: '#059669', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                ⚡ Paid at {formatTime(job.paidAt)}
              </span>
            ) : job.createdAt ? (
              <span style={{ fontSize: 12, color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <FiClock size={13} /> {formatTime(job.createdAt)}
              </span>
            ) : null}
          </div>

          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6 }}>
            Student: <strong style={{ color: 'var(--color-text)' }}>{job.userName || job.userEmail || 'N/A'}</strong> ({job.userEmail})
          </div>
        </div>

        {/* Quick Complete Button */}
        <div>
          {job.status !== 'completed' ? (
            <button
              type="button"
              className="btn btn-success"
              onClick={() => handleMarkComplete(job.token)}
              disabled={isCompleting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
            >
              <HiOutlineCheckCircle size={18} />
              {isCompleting ? 'Marking…' : 'Mark Printed & Done'}
            </button>
          ) : (
            <span
              style={{
                backgroundColor: '#f3f4f6',
                color: '#6b7280',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ✓ Completed
            </span>
          )}
        </div>
      </div>

      {/* Overview Stats bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 8,
          backgroundColor: 'var(--color-bg-subtle, rgba(0,0,0,0.02))',
          padding: '10px 14px',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        <div>
          <span style={{ color: 'var(--color-text-light)', fontSize: 11, textTransform: 'uppercase' }}>Documents</span>
          <div style={{ fontWeight: 700 }}>{job.totalFiles || job.files?.length || 1} file(s)</div>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-light)', fontSize: 11, textTransform: 'uppercase' }}>Total Pages</span>
          <div style={{ fontWeight: 700 }}>{job.totalPages} pages</div>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-light)', fontSize: 11, textTransform: 'uppercase' }}>Total Cost</span>
          <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatCurrency(job.totalCost || 0)}</div>
        </div>
        {job.razorpayPaymentId && (
          <div>
            <span style={{ color: 'var(--color-text-light)', fontSize: 11, textTransform: 'uppercase' }}>Txn ID</span>
            <div style={{ fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.razorpayPaymentId}
            </div>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* MASTER INSTANT-PRINT BUTTONS */}
      {/* ────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>
          ⚡ 1-Click Master Print (All Documents Combined)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {job.combinedColorFileUrl ? (
            <button
              type="button"
              onClick={() => handleDownload(job.combinedColorFileUrl, `Job #${job.token} Color`)}
              className="download-btn"
              style={{
                backgroundColor: '#fffbeb',
                borderColor: '#fde68a',
                borderLeft: '4px solid #f59e0b',
                padding: '10px 14px',
              }}
            >
              <div className="download-btn-icon" style={{ color: '#f59e0b' }}>
                <FiPrinter size={22} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>Open ALL COLOR.pdf</div>
                <div style={{ fontSize: 12, color: '#b45309' }}>Print all color pages across all files</div>
              </div>
            </button>
          ) : (
            <div style={{ padding: '10px 14px', backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb', color: '#9ca3af', fontSize: 13 }}>
              No Color pages in this job
            </div>
          )}

          {job.combinedBwFileUrl ? (
            <button
              type="button"
              onClick={() => handleDownload(job.combinedBwFileUrl, `Job #${job.token} B&W`)}
              className="download-btn"
              style={{
                backgroundColor: '#eff6ff',
                borderColor: '#bfdbfe',
                borderLeft: '4px solid #3b82f6',
                padding: '10px 14px',
              }}
            >
              <div className="download-btn-icon" style={{ color: '#3b82f6' }}>
                <HiOutlineDocumentArrowDown size={22} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 14 }}>Open ALL BW.pdf</div>
                <div style={{ fontSize: 12, color: '#2563eb' }}>Print all B&W pages across all files</div>
              </div>
            </button>
          ) : (
            <div style={{ padding: '10px 14px', backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb', color: '#9ca3af', fontSize: 13 }}>
              No B&W pages in this job
            </div>
          )}
        </div>
      </div>

      {/* Expandable Document Breakdown */}
      <div>
        <button
          type="button"
          onClick={() => toggleExpand(job.token)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {isExpanded ? <HiOutlineChevronUp size={16} /> : <HiOutlineChevronDown size={16} />}
          {isExpanded ? 'Hide' : 'View'} Document Details ({job.files?.length || 1} files)
        </button>

        {isExpanded && job.files && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {job.files.map((fileItem, idx) => (
              <div
                key={idx}
                style={{
                  border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: '#ffffff',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>
                    #{idx + 1} {fileItem.filename}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                    {formatCurrency(fileItem.fileCost || 0)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--color-text-secondary)', fontSize: 12, marginBottom: 8 }}>
                  <span>{fileItem.totalPages} pg</span>
                  <span>Paper: <strong>{fileItem.paperSize}</strong></span>
                  <span>Copies: <strong>{fileItem.copies}</strong></span>
                  <span>B&W: <strong>{fileItem.bwDoubleSided ? 'Double-sided' : 'Single-sided'}</strong></span>
                  {fileItem.colorPages?.length > 0 && (
                    <span>Color: <strong>{fileItem.colorDoubleSided ? 'Double-sided' : 'Single-sided'}</strong> (pg {fileItem.colorPages.join(', ')})</span>
                  )}
                  {fileItem.binding && <span>Binding: <strong>Yes (₹20)</strong></span>}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {fileItem.colorFileUrl && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDownload(fileItem.colorFileUrl, `${fileItem.filename} Color`)}
                      style={{ fontSize: 11, padding: '4px 8px' }}
                    >
                      <FiPrinter /> Color ({fileItem.colorPages?.length || 0} pg)
                    </button>
                  )}
                  {fileItem.bwFileUrl && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDownload(fileItem.bwFileUrl, `${fileItem.filename} BW`)}
                      style={{ fontSize: 11, padding: '4px 8px' }}
                    >
                      <HiOutlineDocumentArrowDown /> BW ({(fileItem.totalPages || 0) - (fileItem.colorPages?.length || 0)} pg)
                    </button>
                  )}
                  {fileItem.originalFileUrl && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDownload(fileItem.originalFileUrl, `${fileItem.filename} Original`)}
                      style={{ fontSize: 11, padding: '4px 8px' }}
                    >
                      <HiOutlineDocumentText /> Original PDF
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

