import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupText, InputGroupInput } from '@/components/ui/input-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

describe('Empty', () => {
  it('renders with data-slot attribute', () => {
    const { container } = render(<Empty data-testid="empty">content</Empty>);
    expect(container.querySelector('[data-slot="empty"]')).toBeInTheDocument();
  });

  it('renders all sub-components', () => {
    render(
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <svg data-testid="icon" />
          </EmptyMedia>
          <EmptyTitle>No items</EmptyTitle>
          <EmptyDescription>Nothing to show</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <button>Action</button>
        </EmptyContent>
      </Empty>,
    );

    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('returns null for EmptyTitle with no children', () => {
    const { container } = render(<EmptyTitle>{null}</EmptyTitle>);
    expect(container.innerHTML).toBe('');
  });

  it('applies custom className', () => {
    const { container } = render(<Empty className="custom-class" />);
    expect(container.firstElementChild).toHaveClass('custom-class');
  });

  it('renders EmptyMedia with icon variant by default', () => {
    const { container } = render(<EmptyMedia />);
    expect(container.querySelector('[data-slot="empty-media"]')).toHaveClass('rounded-full');
  });
});

describe('Field', () => {
  it('renders FieldGroup with space-y-4 spacing', () => {
    const { container } = render(<FieldGroup>content</FieldGroup>);
    expect(container.querySelector('[data-slot="field-group"]')).toHaveClass('space-y-4');
  });

  it('renders Field with space-y-2 spacing', () => {
    const { container } = render(<Field>content</Field>);
    expect(container.querySelector('[data-slot="field"]')).toHaveClass('space-y-2');
  });

  it('renders a field with label, description and error', () => {
    render(
      <Field>
        <FieldLabel htmlFor="test">Name</FieldLabel>
        <FieldDescription>Enter your name</FieldDescription>
        <FieldError errors={[{ type: 'required', message: 'Name is required' }]} />
      </Field>,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('renders nothing when FieldError has no errors', () => {
    const { container } = render(<FieldError errors={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when FieldError errors are undefined', () => {
    const { container } = render(<FieldError errors={[undefined]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('InputGroup', () => {
  it('renders input group with addon and input', () => {
    render(
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="Amount" />
      </InputGroup>,
    );

    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Amount')).toBeInTheDocument();
  });

  it('renders inline-end addon with correct class', () => {
    const { container } = render(
      <InputGroupAddon align="inline-end">suffix</InputGroupAddon>,
    );
    expect(container.querySelector('[data-slot="input-group-addon"]')).toHaveClass('rounded-r-md');
  });
});

describe('Button', () => {
  it('renders with default variant and size', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toHaveAttribute('data-variant', 'default');
    expect(button).toHaveAttribute('data-size', 'default');
  });

  it('renders with destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveAttribute('data-variant', 'destructive');
  });

  it('renders as child component when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link button</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Link button' });
    expect(link).toHaveAttribute('href', '/test');
    expect(link).toHaveAttribute('data-slot', 'button');
  });
});

describe('Input', () => {
  it('renders with data-slot attribute', () => {
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toHaveAttribute('data-slot', 'input');
  });

  it('renders with correct type', () => {
    render(<Input type="email" placeholder="email" />);
    const input = screen.getByPlaceholderText('email');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('forwards additional props', () => {
    render(<Input disabled data-testid="my-input" />);
    expect(screen.getByTestId('my-input')).toBeDisabled();
  });
});
