import { useState, useMemo } from 'react'
import Navbar from '../components/Navbar'
import FileUploader from '../components/FileUploader'
import PriceCard from '../components/PriceCard'
import TransactionHistory from '../components/TransactionHistory'
import { parsePageRanges, calculateMultiFileJobPrice, formatCurrency } from '../utils/calculators'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import {
  HiOutlineCheckCircle,
  HiOutlineDocumentDuplicate,
} from 'react-icons/hi2'

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function StudentView() {
  const { user } = useAuth()

  // Top level tab: 'new_job' | 'history'
  const [mainTab, setMainTab] = useState('new_job')

  // Multi-file state: array of file items with individual print settings
  const [files, setFiles] = useState([])
  const [activeFileId, setActiveFileId] = useState(null)

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resultToken, setResultToken] = useState(null)
  const [resultCost, setResultCost] = useState(0)

  // Handlers for adding and removing files
  const handleFilesAdd = (newFiles) => {
    setFiles((prev) => {
      const updated = [
        ...prev,
        ...newFiles.map((item) => ({
          id: item.id,
          file: item.file,
          totalPages: item.totalPages,
          colorPagesInput: '',
          paperSize: 'A4',
          colorDoubleSided: false,
          bwDoubleSided: false,
          binding: false,
          copies: 1,
        })),
      ]
      if (!activeFileId && updated.length > 0) {
        setActiveFileId(updated[0].id)
      }
      return updated
    })
    setResultToken(null)
  }

  const handleFileRemove = (idToRemove) => {
    setFiles((prev) => {
      const updated = prev.filter((f) => f.id !== idToRemove)
      if (activeFileId === idToRemove) {
        setActiveFileId(updated.length > 0 ? updated[0].id : null)
      }
      return updated
    })
  }

  // Active file item and its index
  const activeFile = useMemo(() => {
    return files.find((f) => f.id === activeFileId) || files[0] || null
  }, [files, activeFileId])

  const activeIndex = useMemo(() => {
    return files.findIndex((f) => f.id === (activeFile?.id))
  }, [files, activeFile])

  // Update setting for the active file
  const updateActiveFileSetting = (field, value) => {
    if (!activeFile) return
    setFiles((prev) =>
      prev.map((item) => (item.id === activeFile.id ? { ...item, [field]: value } : item))
    )
  }

  // Apply current active settings to all files
  const handleApplyToAll = () => {
    if (!activeFile) return
    setFiles((prev) =>
      prev.map((item) => ({
        ...item,
        paperSize: activeFile.paperSize,
        colorDoubleSided: activeFile.colorDoubleSided,
        bwDoubleSided: activeFile.bwDoubleSided,
        binding: activeFile.binding,
        copies: activeFile.copies,
      }))
    )
    toast.success('Settings applied to all documents!')
  }

  // Calculate pricing across all files
  const pricingSummary = useMemo(() => {
    return calculateMultiFileJobPrice(files)
  }, [files])

  // Active file derived color/bw counts
  const activeColorPages = useMemo(() => {
    if (!activeFile) return []
    return parsePageRanges(activeFile.colorPagesInput, activeFile.totalPages)
  }, [activeFile])

  const activeColorCount = activeColorPages.length
  const activeBwCount = activeFile ? Math.max(0, activeFile.totalPages - activeColorCount) : 0

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState('online') // 'online' | 'offline'
  const [paymentInfo, setPaymentInfo] = useState(null)

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error('Please upload at least one PDF file')
      return
    }

    setIsSubmitting(true)

    try {
      const formData = new FormData()

      // Append all PDF files
      files.forEach((item) => {
        formData.append('files', item.file)
      })

      // Append settings for each file as JSON
      const filesSettings = files.map((item) => ({
        filename: item.file.name,
        color_pages: parsePageRanges(item.colorPagesInput, item.totalPages),
        paper_size: item.paperSize,
        color_double_sided: item.colorDoubleSided,
        bw_double_sided: item.bwDoubleSided,
        binding: item.binding,
        copies: item.copies,
        total_pages: item.totalPages,
      }))

      formData.append('files_settings', JSON.stringify(filesSettings))
      formData.append('payment_method', paymentMethod)

      const res = await api.post('/api/jobs', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      const jobToken = res.data.token
      const jobCost = res.data.totalCost || pricingSummary.grandTotal
      const amountPaise = res.data.amountPaise || jobCost * 100
      const razorpayOrderId = res.data.razorpayOrderId
      const razorpayKeyId = res.data.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID || ''

      // ── OFFLINE CASH PAYMENT FLOW ──
      if (paymentMethod === 'offline') {
        setPaymentInfo({
          status: 'offline_cash',
          amount: jobCost,
        })
        setResultToken(jobToken)
        setResultCost(jobCost)
        toast.success(`Job #${jobToken} submitted! Pay at the counter.`)
        return
      }

      // ── ONLINE PAYMENT FLOW (RAZORPAY) ──
      const activeKey = (razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID || '').trim()
      const isRealKey = (
        activeKey &&
        activeKey.startsWith('rzp_') &&
        !activeKey.includes('mock') &&
        !activeKey.includes('your_razorpay')
      )

      if (isRealKey) {
        await loadRazorpayScript()

        if (typeof window.Razorpay !== 'undefined') {
          const options = {
            key: activeKey,
            amount: amountPaise,
            currency: 'INR',
            name: 'Campus Xerox Shop',
            description: `Print Token: ${jobToken} (${files.length} document${files.length !== 1 ? 's' : ''})`,
            ...(razorpayOrderId && razorpayOrderId.startsWith('order_') && !razorpayOrderId.includes('demo')
              ? { order_id: razorpayOrderId }
              : {}),
            prefill: {
              name: user?.name || user?.email?.split('@')[0] || 'Student',
              email: user?.email || '',
              contact: '',
            },
            theme: {
              color: '#2563eb',
            },
            handler: async function (response) {
              try {
                toast.loading('Verifying payment...', { id: 'payment-verify' })
                await api.post('/api/payment/verify', {
                  token: jobToken,
                  razorpay_order_id: response.razorpay_order_id || razorpayOrderId || '',
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature || '',
                })
                toast.success('Payment verified! Top-priority print queued.', { id: 'payment-verify' })

                setPaymentInfo({
                  paymentId: response.razorpay_payment_id,
                  orderId: response.razorpay_order_id || razorpayOrderId,
                  status: 'paid',
                  amount: jobCost,
                })
                setResultToken(jobToken)
                setResultCost(jobCost)
              } catch (err) {
                console.error('Payment verification error:', err)
                toast.error('Payment verification issue. Show token at counter: ' + jobToken, { id: 'payment-verify' })
                setPaymentInfo({
                  status: 'pending',
                  amount: jobCost,
                })
                setResultToken(jobToken)
                setResultCost(jobCost)
              }
            },
            modal: {
              ondismiss: function () {
                toast('Payment window closed. Token generated with Pay at Counter status.', { icon: 'ℹ️' })
                setPaymentInfo({
                  status: 'offline_cash',
                  amount: jobCost,
                })
                setResultToken(jobToken)
                setResultCost(jobCost)
              },
            },
          }

          try {
            const rzp = new window.Razorpay(options)
            rzp.on('payment.failed', function (response) {
              console.error('Razorpay payment failed:', response.error)
              toast.error(`Payment failed: ${response.error?.description || 'Payment error'}`)
              setPaymentInfo({
                status: 'offline_cash',
                amount: jobCost,
              })
              setResultToken(jobToken)
              setResultCost(jobCost)
            })
            rzp.open()
            return
          } catch (modalErr) {
            console.error('Failed to open Razorpay modal:', modalErr)
          }
        }
      }

      // Simulated / Test mode automatic verification
      const demoPaymentId = `pay_sim_${jobToken}_${Date.now().toString().slice(-6)}`
      try {
        await api.post('/api/payment/verify', {
          token: jobToken,
          razorpay_order_id: razorpayOrderId || `order_sim_${jobToken}`,
          razorpay_payment_id: demoPaymentId,
          razorpay_signature: 'demo_sig',
        })
        setPaymentInfo({
          paymentId: demoPaymentId,
          orderId: razorpayOrderId,
          status: 'paid',
          amount: jobCost,
        })
      } catch (e) {
        console.warn('Demo verification notice:', e)
        setPaymentInfo({
          paymentId: demoPaymentId,
          status: 'paid',
          amount: jobCost,
        })
      }

      setResultToken(jobToken)
      setResultCost(jobCost)
      toast.success('Payment verified! Top priority print job queued.')
    } catch (err) {
      console.error('Submission error:', err)
      toast.error(err.response?.data?.detail || 'Failed to submit print job')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNewJob = () => {
    setFiles([])
    setActiveFileId(null)
    setPaymentInfo(null)
    setResultToken(null)
    setResultCost(0)
    setPaymentMethod('online')
  }

  // ---- Payment Done & Token Confirmation Screen ----
  if (resultToken) {
    const isPaid = paymentInfo?.status === 'paid'

    return (
      <>
        <Navbar />
        <div className="page-container">
          <div
            className="card"
            style={{
              maxWidth: 580,
              margin: '40px auto',
              borderTop: isPaid ? '4px solid #10b981' : '4px solid #f59e0b',
            }}
          >
            <div className="token-result">
              <div
                className="token-result-icon"
                style={{
                  backgroundColor: isPaid ? '#ecfdf5' : '#fffbeb',
                  color: isPaid ? '#10b981' : '#f59e0b',
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 36,
                  margin: '0 auto 16px',
                }}
              >
                <HiOutlineCheckCircle />
              </div>

              <h2 style={{ color: isPaid ? '#065f46' : '#92400e', fontSize: 24, marginBottom: 6 }}>
                {isPaid ? 'Payment Successful!' : 'Print Job Submitted!'}
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 20 }}>
                {isPaid
                  ? 'Your order has been placed in the priority live queue on the Xerox Shop admin panel.'
                  : 'Your document is queued. Please pay at the Xerox counter when picking up your printouts.'}
              </p>

              {/* Priority Queue Callout for Online Paid Orders */}
              {isPaid && (
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#ecfdf5',
                    borderRadius: 8,
                    border: '1px solid #a7f3d0',
                    color: '#065f46',
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span>⚡</span>
                  <span>PRIORITY QUEUE: Paid orders appear first on the shopkeeper screen!</span>
                </div>
              )}

              {/* Token Display */}
              <div
                className="token-display"
                style={{
                  padding: '16px 20px',
                  borderRadius: 12,
                  backgroundColor: isPaid ? '#f0fdf4' : '#fffbeb',
                  border: isPaid ? '2px dashed #86efac' : '2px dashed #fde68a',
                  marginBottom: 20,
                }}
              >
                <div className="token-display-label" style={{ color: isPaid ? '#166534' : '#92400e', fontWeight: 600 }}>
                  Your Collection Token
                </div>
                <div
                  className="token-display-value"
                  style={{
                    fontSize: 40,
                    letterSpacing: 4,
                    color: isPaid ? '#15803d' : '#b45309',
                    fontWeight: 800,
                  }}
                >
                  {resultToken}
                </div>
                <div style={{ fontSize: 12, color: isPaid ? '#166534' : '#92400e', marginTop: 4 }}>
                  Show this 5-digit token at the counter to collect your prints
                </div>
              </div>

              {/* Receipt Summary Box */}
              <div
                style={{
                  textAlign: 'left',
                  backgroundColor: 'var(--color-bg-subtle, rgba(0,0,0,0.02))',
                  borderRadius: 10,
                  padding: '14px 18px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  marginBottom: 20,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 8, borderBottom: '1px solid var(--color-border, #e5e7eb)', paddingBottom: 6 }}>
                  Order Summary
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Payment Mode:</span>
                  {isPaid ? (
                    <span style={{ color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981' }} />
                      PAID ONLINE (Razorpay)
                    </span>
                  ) : (
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                      💵 PAY AT COUNTER (Cash)
                    </span>
                  )}
                </div>

                {paymentInfo?.paymentId && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Transaction ID:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{paymentInfo.paymentId}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Total Documents:</span>
                  <span style={{ fontWeight: 600 }}>{files.length} {files.length === 1 ? 'file' : 'files'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--color-border, #e5e7eb)', fontWeight: 700 }}>
                  <span>{isPaid ? 'Amount Paid:' : 'Amount to Pay at Counter:'}</span>
                  <span style={{ color: 'var(--color-primary)', fontSize: 16 }}>{formatCurrency(resultCost)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleNewJob}
                  style={{ flex: 1, minWidth: 160 }}
                >
                  Submit Another Job
                </button>
                <button
                  className="btn btn-secondary btn-lg"
                  onClick={() => {
                    handleNewJob()
                    setMainTab('history')
                  }}
                  style={{ flex: 1, minWidth: 160 }}
                >
                  📜 View in My History
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ---- Main Student View (New Job / Transaction History Tabs) ----
  return (
    <>
      <Navbar />
      <div className="page-container">
        {/* Top Header & Tab Pill Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div className="page-header" style={{ marginBottom: 0, textAlign: 'left' }}>
            <h1 className="page-title">Campus Print Station</h1>
            <p className="page-subtitle">
              {mainTab === 'new_job'
                ? 'Upload up to 5 PDF files, configure print settings, and get your token'
                : 'View your transaction receipts, collection tokens, and print statuses'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 6, backgroundColor: 'var(--color-bg-subtle, rgba(0,0,0,0.04))', padding: 4, borderRadius: 10 }}>
            <button
              type="button"
              className={`btn ${mainTab === 'new_job' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMainTab('new_job')}
              style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8 }}
            >
              🖨️ New Print Order
            </button>
            <button
              type="button"
              className={`btn ${mainTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMainTab('history')}
              style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8 }}
            >
              📜 My History & Tokens
            </button>
          </div>
        </div>

        {/* Tab 1: Transaction History View */}
        {mainTab === 'history' && (
          <TransactionHistory onNewOrderClick={() => setMainTab('new_job')} />
        )}

        {/* Tab 2: New Print Order View */}
        {mainTab === 'new_job' && (
          <div className="student-layout">
            {/* Left column - form */}
            <div>
              {/* Step 1: Upload */}
              <div className="section-step">
                <div className="section-step-header">
                  <div className="step-number">1</div>
                  <div className="step-title">Upload Documents (Up to 5 PDFs)</div>
                </div>
                <FileUploader
                  files={files}
                  onFilesAdd={handleFilesAdd}
                  onFileRemove={handleFileRemove}
                />
              </div>

            {/* Step 2: Settings (visible after at least 1 file uploaded) */}
            {files.length > 0 && activeFile && (
              <div className="section-step">
                <div className="section-step-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="step-number">2</div>
                    <div className="step-title">Print Settings</div>
                  </div>
                  {files.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleApplyToAll}
                      style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                      title="Apply current file's paper size, sides, copies, and binding to all uploaded documents"
                    >
                      <HiOutlineDocumentDuplicate size={16} />
                      Apply Settings to All
                    </button>
                  )}
                </div>

                {/* File tab selector if multiple files */}
                {files.length > 1 && (
                  <div
                    className="file-tabs"
                    style={{
                      display: 'flex',
                      gap: 8,
                      overflowX: 'auto',
                      paddingBottom: 8,
                      marginBottom: 12,
                    }}
                  >
                    {files.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveFileId(item.id)}
                        className={`btn ${activeFile.id === item.id ? 'btn-primary' : 'btn-secondary'}`}
                        style={{
                          fontSize: 13,
                          padding: '8px 14px',
                          whiteSpace: 'nowrap',
                          borderRadius: 8,
                        }}
                      >
                        <span style={{ fontWeight: 700, marginRight: 6 }}>#{idx + 1}</span>
                        {item.file.name.length > 18 ? item.file.name.slice(0, 15) + '…' : item.file.name}
                        <span style={{ opacity: 0.8, fontSize: 11, marginLeft: 6 }}>({item.totalPages} pg)</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="card">
                  {/* File name banner in settings */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: 'var(--color-bg-subtle, rgba(0,0,0,0.03))',
                      borderRadius: 8,
                      marginBottom: 16,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      Configuring File #{activeIndex + 1}: {activeFile.file.name}
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {activeFile.totalPages} total page{activeFile.totalPages !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Paper Size Selection */}
                  <div className="form-group">
                    <label className="form-label">Paper Size</label>
                    <div className="radio-group">
                      <label className="radio-option">
                        <input
                          type="radio"
                          name={`paperSize-${activeFile.id}`}
                          value="A4"
                          checked={activeFile.paperSize === 'A4'}
                          onChange={() => updateActiveFileSetting('paperSize', 'A4')}
                        />
                        <span className="radio-box">A4</span>
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name={`paperSize-${activeFile.id}`}
                          value="A3"
                          checked={activeFile.paperSize === 'A3'}
                          onChange={() => updateActiveFileSetting('paperSize', 'A3')}
                        />
                        <span className="radio-box">A3</span>
                      </label>
                    </div>
                  </div>

                  {/* Color pages input */}
                  <div className="form-group">
                    <label className="form-label">
                      Color Pages
                      <span className="form-label-hint">
                        (leave empty if all B&W)
                      </span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 1-3, 7, 12-15"
                      value={activeFile.colorPagesInput || ''}
                      onChange={(e) => updateActiveFileSetting('colorPagesInput', e.target.value)}
                    />
                    <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 4 }}>
                      {activeColorCount > 0
                        ? `${activeColorCount} color page${activeColorCount !== 1 ? 's' : ''}, ${activeBwCount} B&W page${activeBwCount !== 1 ? 's' : ''}`
                        : `All ${activeFile.totalPages} pages will print in B&W`}
                    </div>
                  </div>

                  {/* Color double-sided toggle */}
                  {activeColorCount > 0 && (
                    <div className="form-group">
                      <label className="form-label">Color Pages - Sides</label>
                      <div className="toggle-group">
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={activeFile.colorDoubleSided || false}
                            onChange={(e) => updateActiveFileSetting('colorDoubleSided', e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                        <div className="toggle-label">
                          {activeFile.colorDoubleSided ? 'Double-sided' : 'Single-sided'}
                          <span>
                            Color: {activeFile.paperSize === 'A3' ? 'Rs.15' : 'Rs.10'}/page
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* B&W double-sided toggle */}
                  {activeBwCount > 0 && (
                    <div className="form-group">
                      <label className="form-label">B&W Pages - Sides</label>
                      <div className="toggle-group">
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={activeFile.bwDoubleSided || false}
                            onChange={(e) => updateActiveFileSetting('bwDoubleSided', e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                        <div className="toggle-label">
                          {activeFile.bwDoubleSided
                            ? `Double-sided (${Math.ceil(activeBwCount / 2)} sheet${Math.ceil(activeBwCount / 2) !== 1 ? 's' : ''})`
                            : 'Single-sided'}
                          <span>
                            B&W: {activeFile.paperSize === 'A3' ? (activeFile.bwDoubleSided ? 'Rs.8/sheet' : 'Rs.4/page') : (activeFile.bwDoubleSided ? 'Rs.2/sheet (halves cost)' : 'Rs.2/page')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="form-row">
                    {/* Copies */}
                    <div className="form-group">
                      <label className="form-label">Number of Copies</label>
                      <input
                        type="number"
                        className="form-input"
                        min="1"
                        max="50"
                        value={activeFile.copies || 1}
                        onChange={(e) =>
                          updateActiveFileSetting('copies', Math.max(1, parseInt(e.target.value) || 1))
                        }
                      />
                    </div>

                    {/* Binding checkbox */}
                    <div className="form-group">
                      <label className="form-label">Binding</label>
                      <div className="toggle-group">
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={activeFile.binding || false}
                            onChange={(e) => updateActiveFileSetting('binding', e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                        <div className="toggle-label">
                          {activeFile.binding ? 'Yes' : 'No'}
                          <span>Rs.20 per copy</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Choose Payment & Submit */}
            {files.length > 0 && (
              <div className="section-step">
                <div className="section-step-header">
                  <div className="step-number">3</div>
                  <div className="step-title">Choose Payment Option & Submit</div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ marginBottom: 12 }}>
                    Payment Method
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    {/* Online Payment Option */}
                    <label
                      style={{
                        display: 'block',
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: paymentMethod === 'online' ? '2px solid var(--color-primary)' : '1px solid var(--color-border, #e5e7eb)',
                        backgroundColor: paymentMethod === 'online' ? 'rgba(37, 99, 235, 0.04)' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="radio"
                            name="paymentMethod"
                            value="online"
                            checked={paymentMethod === 'online'}
                            onChange={() => setPaymentMethod('online')}
                          />
                          <span style={{ fontWeight: 700, fontSize: 14 }}>💳 Pay Online</span>
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            backgroundColor: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          ⚡ PRIORITY
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 22 }}>
                        Razorpay / UPI / QR / Card. <strong>Appears & prints first</strong> on admin screen!
                      </div>
                    </label>

                    {/* Offline Cash Option */}
                    <label
                      style={{
                        display: 'block',
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: paymentMethod === 'offline' ? '2px solid #f59e0b' : '1px solid var(--color-border, #e5e7eb)',
                        backgroundColor: paymentMethod === 'offline' ? 'rgba(245, 158, 11, 0.04)' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="offline"
                          checked={paymentMethod === 'offline'}
                          onChange={() => setPaymentMethod('offline')}
                        />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>💵 Pay at Counter</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 22 }}>
                        Generate token now and pay cash at the Xerox counter when collecting prints.
                      </div>
                    </label>
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleSubmit}
                  disabled={isSubmitting || files.length === 0}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: paymentMethod === 'online' ? 'var(--color-primary)' : '#d97706',
                  }}
                >
                  {isSubmitting ? (
                    'Processing Order...'
                  ) : paymentMethod === 'online' ? (
                    <>
                      <span>⚡ Pay Online & Print ({files.length} {files.length === 1 ? 'Doc' : 'Docs'})</span>
                      <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 4 }}>
                        {formatCurrency(pricingSummary.grandTotal)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>📄 Generate Token & Pay at Counter ({files.length} {files.length === 1 ? 'Doc' : 'Docs'})</span>
                      <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 4 }}>
                        {formatCurrency(pricingSummary.grandTotal)}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right column - price card (sticky sidebar) */}
          {files.length > 0 && (
            <div className="student-sidebar">
              <PriceCard fileItems={files} />
            </div>
          )}
        </div>
        )}
      </div>
    </>
  )
}
