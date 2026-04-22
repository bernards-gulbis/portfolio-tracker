import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';

import type { Holding } from '../../api';

interface TickerComboboxProps {
  value: string;
  holdings: Holding[];
  editTicker?: string;
  invalid?: boolean;
  placeholder: string;
  noHoldingsText: string;
  onChange: (value: string) => void;
}

export const TickerCombobox = ({
  value,
  holdings,
  editTicker,
  invalid,
  placeholder,
  noHoldingsText,
  onChange,
}: TickerComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return holdings;
    const q = search.toUpperCase();
    return holdings.filter((h) => h.ticker.toUpperCase().includes(q));
  }, [holdings, search]);

  // Show edit ticker as fallback if not in current holdings
  const showEditFallback = editTicker && !holdings.some((h) => h.ticker === editTicker);

  const selectHolding = (ticker: string) => {
    onChange(ticker);
    setSearch('');
    setOpen(false);
  };

  const searchNorm = search.trim().toUpperCase();

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          id="tx-ticker"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className="w-full justify-between font-normal aria-invalid:border-destructive"
        >
          <span className={value ? '' : 'text-muted-foreground'}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={(v) => setSearch(v.toUpperCase())}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchNorm) {
                e.preventDefault();
                selectHolding(searchNorm);
              }
            }}
          />
          <CommandList className="max-h-48">
            {filtered.length === 0 && !searchNorm && !showEditFallback && (
              <CommandEmpty>{noHoldingsText}</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((h) => (
                <CommandItem
                  key={h.ticker}
                  value={h.ticker}
                  onSelect={() => selectHolding(h.ticker)}
                >
                  <Check
                    className={`h-4 w-4 ${value === h.ticker ? 'opacity-100' : 'opacity-0'}`}
                  />
                  {h.ticker} ({h.quantity} shares)
                </CommandItem>
              ))}
              {showEditFallback && (
                <CommandItem
                  value={editTicker}
                  onSelect={() => selectHolding(editTicker)}
                >
                  <Check
                    className={`h-4 w-4 ${value === editTicker ? 'opacity-100' : 'opacity-0'}`}
                  />
                  {editTicker}
                </CommandItem>
              )}
              {searchNorm &&
                !holdings.some((h) => h.ticker === searchNorm) &&
                searchNorm !== editTicker && (
                  <CommandItem
                    value={searchNorm}
                    onSelect={() => selectHolding(searchNorm)}
                  >
                    <Check className="h-4 w-4 opacity-0" />
                    {searchNorm}
                  </CommandItem>
                )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
