import { useState } from 'react';

import { Calendar } from '@/components/ui/calendar';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';

import { parseLocalDate, toLocalDate } from './helpers';

interface DatePickerFieldProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  invalid?: boolean;
  locale: string;
  id: string;
  pickerAriaLabel: string;
}

export const DatePickerField = ({
  value,
  onChange,
  invalid,
  locale,
  id,
  pickerAriaLabel,
}: DatePickerFieldProps) => {
  const [open, setOpen] = useState(false);
  // displayValue mirrors the form value in YYYY-MM-DD format so the input
  // can be parsed back reliably regardless of the active locale.
  const [displayValue, setDisplayValue] = useState(value ?? '');
  const [month, setMonth] = useState<Date | undefined>(parseLocalDate(value));
  const [prevValue, setPrevValue] = useState(value);

  // Sync with external value changes (e.g. form reset) — adjust state during render
  if (prevValue !== value) {
    setPrevValue(value);
    setDisplayValue(value ?? '');
    const date = parseLocalDate(value);
    if (date) setMonth(date);
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const typed = e.target.value;
    setDisplayValue(typed);
    const parsed = parseLocalDate(typed);
    if (parsed) {
      onChange(toLocalDate(parsed));
      setMonth(parsed);
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const ymd = toLocalDate(date);
      onChange(ymd);
      setDisplayValue(ymd);
      setMonth(date);
    }
    setOpen(false);
  };

  const placeholder = 'YYYY-MM-DD';

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        value={displayValue}
        placeholder={placeholder}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-invalid={invalid}
        autoComplete="off"
        className="rounded-l-md"
      />
      <InputGroupAddon align="inline-end" className="bg-background p-0">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <InputGroupButton aria-label={pickerAriaLabel}>
              <CalendarIcon />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden p-0"
            align="end"
            alignOffset={-8}
            sideOffset={10}
          >
            <Calendar
              mode="single"
              selected={parseLocalDate(value)}
              month={month}
              onMonthChange={setMonth}
              onSelect={handleCalendarSelect}
              formatters={{
                formatCaption: (date) =>
                  date.toLocaleDateString(locale, {
                    month: 'long',
                    year: 'numeric',
                  }),
                formatMonthDropdown: (date) =>
                  date.toLocaleDateString(locale, { month: 'long' }),
                formatWeekdayName: (weekday) =>
                  weekday.toLocaleDateString(locale, { weekday: 'short' }),
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
};
