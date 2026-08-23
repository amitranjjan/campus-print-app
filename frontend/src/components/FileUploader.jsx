import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { HiOutlineCloudArrowUp, HiOutlineDocumentText, HiPlus } from 'react-icons/hi2'
import { FiX } from 'react-icons/fi'
import toast from 'react-hot-toast'

/**
 * Drag-and-drop PDF upload component supporting up to 5 PDF files.
 * Uses pdfjs-dist to extract page count from each uploaded PDF.
 *
 * Props:
 *   files - Array of file objects [{ id, file, totalPages }]
 *   onFilesAdd(newFiles) - Callback when valid PDFs are selected/dropped
 *   onFileRemove(id)     - Callback to remove a specific file
 */
export default function FileUploader({ files = [], onFilesAdd, onFileRemove }) {
  const maxFiles = 5
  const remainingSlots = Math.max(0, maxFiles - files.length)

  const onDrop = useCallback(
    async (acceptedFiles) => {
      if (!acceptedFiles || acceptedFiles.length === 0) return

      if (files.length >= maxFiles) {
        toast.error('Maximum 5 PDF files allowed per print job')
        return
      }

      let filesToProcess = acceptedFiles
      if (files.length + acceptedFiles.length > maxFiles) {
        toast.error(`You can only upload up to 5 files. Processing first ${remainingSlots} file(s).`)
        filesToProcess = acceptedFiles.slice(0, remainingSlots)
      }

      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

        const processedList = []
        for (const f of filesToProcess) {
          try {
            const arrayBuffer = await f.arrayBuffer()
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
            const pageCount = pdf.numPages || 1
            processedList.push({
              id: `${f.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              file: f,
              totalPages: pageCount,
            })
          } catch (err) {
            console.error(`Error reading ${f.name}:`, err)
            processedList.push({
              id: `${f.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              file: f,
              totalPages: 1,
            })
          }
        }

        if (processedList.length > 0) {
          onFilesAdd(processedList)
        }
      } catch (err) {
        console.error('Error in PDF processing:', err)
        toast.error('Error processing PDF files')
      }
    },
    [files, onFilesAdd, maxFiles, remainingSlots]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: files.length >= maxFiles,
  })

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="file-uploader">
      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="uploaded-files-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            <span>Uploaded Files ({files.length}/{maxFiles})</span>
            {files.length < maxFiles && (
              <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
                + You can add {remainingSlots} more {remainingSlots === 1 ? 'file' : 'files'}
              </span>
            )}
          </div>

          {files.map((item, idx) => (
            <div key={item.id} className="file-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                <div className="file-info-icon" style={{ flexShrink: 0 }}>
                  <HiOutlineDocumentText />
                </div>
                <div className="file-info-details" style={{ overflow: 'hidden' }}>
                  <div className="file-info-name" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600, marginRight: 6, color: 'var(--color-primary)' }}>#{idx + 1}</span>
                    {item.file.name}
                  </div>
                  <div className="file-info-meta">
                    {formatFileSize(item.file.size)} • {item.totalPages} page{item.totalPages !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-remove"
                onClick={() => onFileRemove(item.id)}
                title="Remove file"
                style={{ flexShrink: 0 }}
              >
                <FiX />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone area */}
      {files.length < maxFiles && (
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''}`}
          style={files.length > 0 ? { padding: '20px 16px', borderStyle: 'dashed' } : {}}
        >
          <input {...getInputProps()} />
          <div className="dropzone-icon" style={files.length > 0 ? { fontSize: 24, marginBottom: 6 } : {}}>
            {files.length > 0 ? <HiPlus /> : <HiOutlineCloudArrowUp />}
          </div>
          <h4>
            {isDragActive
              ? 'Drop your PDF files here…'
              : files.length > 0
              ? `Click or drop to add more PDFs (up to ${maxFiles})`
              : 'Drag & drop up to 5 PDF files here'}
          </h4>
          <p>or click to browse • Maximum 5 PDF files</p>
        </div>
      )}
    </div>
  )
}

