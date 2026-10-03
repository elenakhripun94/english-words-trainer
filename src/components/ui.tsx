import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cx } from '../lib/cx'
import { ru } from '../i18n/ru'

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        variant === 'primary' && 'bg-accent text-white hover:bg-[#0c5a47]',
        variant === 'ghost' && 'bg-transparent text-ink hover:bg-black/5',
        variant === 'soft' && 'bg-accent-soft text-accent hover:bg-[#d7eee6]',
        variant === 'danger' && 'bg-bad-bg text-bad hover:bg-[#fbd5d2]',
        className,
      )}
      {...props}
    />
  )
}

export function TextField({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <input id={id} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-accent" {...props} />
    </label>
  )
}

export function TextArea({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <textarea id={id} className="min-h-32 w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-accent" {...props} />
    </label>
  )
}

export function SelectField({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <select id={id} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-accent" {...props}>
        {children}
      </select>
    </label>
  )
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('max-h-[92dvh] w-full overflow-auto rounded-3xl bg-card p-5 shadow-xl', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-serif text-2xl">{title}</h2>
          <Button variant="ghost" aria-label={ru.close} onClick={onClose}>
            ×
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex rounded-full px-2.5 py-0.5 text-sm font-semibold',
        tone === 'neutral' && 'bg-black/5 text-muted',
        tone === 'good' && 'bg-good-bg text-good',
        tone === 'warn' && 'bg-warn-bg text-warn',
        tone === 'bad' && 'bg-bad-bg text-bad',
      )}
    >
      {children}
    </span>
  )
}

export function Spinner() {
  return <p className="py-10 text-center text-muted">{ru.loading}</p>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-muted">{children}</p>
}
