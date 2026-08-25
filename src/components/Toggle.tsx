interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}

export function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-border'
      }`}
    >
      {/* Positioned via left/right rather than a translateX offset — this project's Tailwind v4
          setup silently drops arbitrary bracket values like `translate-x-[22px]`, so the knob
          never actually moved; every toggle looked stuck at "off" regardless of checked state,
          only the track color changed. left-0.5/right-0.5 are named-scale utilities that work
          and stay symmetric (2px inset) on either side without needing an exact px offset. */}
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-all ${
          checked ? 'right-0.5' : 'left-0.5'
        }`}
      />
    </button>
  )
}
