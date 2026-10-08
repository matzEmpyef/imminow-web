import { useRef, useState, type ReactNode } from 'react'
import { UploadCloud } from 'lucide-react'

/**
 * The dashed "drop a file here, or click to browse" area. It only hands the chosen file to the
 * caller; what the file may be is the server's to say. `accept` narrows the browser's own file
 * dialog and nothing else.
 */
export function FileDropArea({
  label,
  hint,
  accept,
  onFile,
  disabled,
}: {
  /** The one line inside the area; also its name for a screen reader. */
  label: string
  hint?: ReactNode
  accept?: string
  onFile: (file: File) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function take(file: File | undefined) {
    if (file && !disabled) onFile(file)
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        take(e.dataTransfer.files[0])
      }}
      onClick={() => {
        if (!disabled) inputRef.current?.click()
      }}
      onKeyDown={(e) => {
        if (disabled || e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      className={`flex flex-col items-center justify-center gap-xs rounded-md border-2 border-dashed px-md py-lg text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      } ${dragOver ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
    >
      <UploadCloud className="h-6 w-6 text-primary" aria-hidden />
      <p className="text-body-sm font-medium text-text-primary">{label}</p>
      {hint && <p className="text-caption text-text-secondary">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        // A screen reader meets the area itself; the input is only the browser's file dialog.
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          take(e.target.files?.[0])
          // The same file can be chosen again after a correction.
          e.target.value = ''
        }}
      />
    </div>
  )
}
