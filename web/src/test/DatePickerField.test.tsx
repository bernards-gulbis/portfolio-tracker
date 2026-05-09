import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePickerField } from '../components/transaction-form/DatePickerField';

describe('DatePickerField', () => {
  it('renders with the provided value as the input display', () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        value="2025-06-15"
        onChange={onChange}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
      />,
    );
    const input = screen.getByDisplayValue('2025-06-15');
    expect(input).toBeInTheDocument();
  });

  it('exposes a calendar trigger with the given aria-label', () => {
    render(
      <DatePickerField
        value=""
        onChange={vi.fn()}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
      />,
    );
    expect(screen.getByRole('button', { name: 'Open date picker' })).toBeInTheDocument();
  });

  it('calls onChange with the parsed date when a valid YYYY-MM-DD is typed', () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        value=""
        onChange={onChange}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '2025-06-15' } });

    expect(onChange).toHaveBeenCalledWith('2025-06-15');
  });

  it('does not call onChange while the user is typing an incomplete date', () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        value=""
        onChange={onChange}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '2025-06' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('updates the displayed value when an external value prop changes', () => {
    const { rerender } = render(
      <DatePickerField
        value="2025-06-15"
        onChange={vi.fn()}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
      />,
    );
    expect(screen.getByDisplayValue('2025-06-15')).toBeInTheDocument();

    rerender(
      <DatePickerField
        value="2025-08-01"
        onChange={vi.fn()}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
      />,
    );
    expect(screen.getByDisplayValue('2025-08-01')).toBeInTheDocument();
  });

  it('opens the popover when ArrowDown is pressed in the input', async () => {
    const user = userEvent.setup();
    render(
      <DatePickerField
        value="2025-06-15"
        onChange={vi.fn()}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
      />,
    );
    const input = screen.getByRole('textbox');
    input.focus();
    await user.keyboard('{ArrowDown}');

    // The popover should mount a role=dialog when open
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('marks the input as invalid when invalid prop is true', () => {
    render(
      <DatePickerField
        value="2025-06-15"
        onChange={vi.fn()}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
        invalid
      />,
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('calls onChange with empty string when input is cleared', () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        value="2025-06-15"
        onChange={onChange}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
      />,
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('closes the popover when a date is selected from the calendar', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DatePickerField
        value="2025-06-15"
        onChange={onChange}
        locale="en-US"
        id="date"
        pickerAriaLabel="Open date picker"
      />,
    );

    // Open the popover
    await user.click(screen.getByRole('button', { name: 'Open date picker' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Click a calendar day button to trigger handleCalendarSelect
    // CalendarDayButton renders with data-day attribute (not name)
    const dayButtons = dialog.querySelectorAll('button[data-day]');
    expect(dayButtons.length).toBeGreaterThan(0);
    await user.click(dayButtons[0] as HTMLElement);

    // onChange must have been called with a YYYY-MM-DD string
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    // Popover should close after selection
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
