import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { api, RawDataset } from '../services/api'


interface UploadDatasetModalProps {
  projectId: string
  onUploadSuccess?: (dataset: RawDataset) => void
}


export default function UploadDatasetModal({
  projectId,
  onUploadSuccess,
}: UploadDatasetModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)


  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null

    setFile(selectedFile)
    setError(null)
    setSuccess(null)
  }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!file) {
      setError('Please select a CSV or XLSX file first.')
      return
    }

    setIsUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const dataset = await api.uploadDataset(projectId, file)

      setSuccess(
        `Upload successful: ${dataset.name ?? file.name} — ` +
          `${dataset.row_count ?? 0} rows, ` +
          `${dataset.column_count ?? 0} columns.`,
      )

      setFile(null)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      onUploadSuccess?.(dataset)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred during upload.',
      )
    } finally {
      setIsUploading(false)
    }
  }


  return (
    <section>
      <h3>Upload dataset</h3>

      <form onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileChange}
          disabled={isUploading}
        />

        <button type="submit" disabled={!file || isUploading}>
          {isUploading ? 'Uploading…' : 'Upload dataset'}
        </button>
      </form>

      {error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}

      {success && (
        <p role="status" style={{ color: 'green' }}>
          {success}
        </p>
      )}
    </section>
  )
}