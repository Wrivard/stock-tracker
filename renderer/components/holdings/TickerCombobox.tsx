import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'

import type { SymbolSearchResult } from '../../../main/services/types'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface TickerComboboxProps {
  value: string
  onChange: (symbol: string) => void
  // Optional callback fired when the user picks a result from the dropdown.
  // The parent can use this to auto-fill the currency / name fields.
  onPick?: (result: SymbolSearchResult) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}

export function TickerCombobox({
  value,
  onChange,
  onPick,
  placeholder = 'AAPL, SHOP.TO…',
  disabled,
  autoFocus,
}: TickerComboboxProps) {
  const { locale } = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SymbolSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    if (query.trim().length === 0) {
      setResults([])
      return
    }
    setLoading(true)
    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api().market.search(query)
        setResults(res.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  function handleSelect(r: SymbolSearchResult) {
    onChange(r.displaySymbol.toUpperCase())
    onPick?.(r)
    setOpen(false)
    setQuery('')
  }

  // If the user has typed a custom symbol that's not in results, surface a
  // "Use {value}" item so they can commit free-form input via the dropdown.
  const trimmed = query.trim().toUpperCase()
  const hasExactMatch = results.some(
    (r) => r.displaySymbol.toUpperCase() === trimmed,
  )
  const showUseLiteral = trimmed.length > 0 && !hasExactMatch && !loading

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            'w-full justify-between font-mono h-9 px-3 text-sm',
            !value && 'text-muted-foreground font-normal',
          )}
        >
          {value || placeholder}
          <ChevronDown className="size-3.5 opacity-50 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={
              locale === 'fr'
                ? 'Cherche par ticker ou nom…'
                : 'Search by ticker or name…'
            }
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 mr-2 animate-spin" />
                {locale === 'fr' ? 'Recherche…' : 'Searching…'}
              </div>
            )}
            {error && (
              <div className="py-3 px-2 text-xs text-destructive">{error}</div>
            )}
            {!loading && !error && trimmed.length === 0 && (
              <CommandEmpty>
                {locale === 'fr'
                  ? 'Tape pour rechercher un symbole…'
                  : 'Type to search for a symbol…'}
              </CommandEmpty>
            )}
            {!loading && !error && trimmed.length > 0 && results.length === 0 && (
              <CommandEmpty>
                {locale === 'fr' ? 'Aucun resultat.' : 'No results.'}
              </CommandEmpty>
            )}
            {!loading && results.length > 0 && (
              <CommandGroup heading={locale === 'fr' ? 'Resultats' : 'Results'}>
                {results.map((r) => (
                  <CommandItem
                    key={r.symbol}
                    value={r.symbol}
                    onSelect={() => handleSelect(r)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono font-medium text-sm shrink-0">
                        {r.displaySymbol}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {r.description}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                      {r.type}
                    </span>
                    {value === r.displaySymbol && (
                      <Check className="size-3.5 ml-2 text-primary shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showUseLiteral && (
              <CommandGroup heading={locale === 'fr' ? 'Saisie libre' : 'Custom'}>
                <CommandItem
                  value={`__literal-${trimmed}`}
                  onSelect={() => {
                    onChange(trimmed)
                    setOpen(false)
                    setQuery('')
                  }}
                  className="cursor-pointer"
                >
                  <span className="font-mono font-medium">{trimmed}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {locale === 'fr' ? 'utiliser tel quel' : 'use as-is'}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
