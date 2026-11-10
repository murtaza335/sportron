import { FormField, PillSelect, TextField } from '@/components/tournaments/form';
import type { TournamentEntryField } from '@/types';

/** Picks the control for an entry-form field by its type (PLAN §12.10). */
export function EntryFieldControl({
  field,
  value,
  error,
  onChange,
  autoFocus,
}: {
  field: TournamentEntryField;
  value: string;
  error?: string | null;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const label = `${field.label}${field.is_required ? ' *' : ''}`;

  return (
    <FormField label={label} error={error} hint={field.is_public ? undefined : '🔒 Private — only admins and the entrant see this'}>
      {field.field_type === 'select' ? (
        <PillSelect
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          value={value || null}
          onChange={(v) => onChange(v === value ? '' : v)}
        />
      ) : (
        <TextField
          value={value}
          onChangeText={onChange}
          placeholder={field.placeholder ?? undefined}
          invalid={!!error}
          autoFocus={autoFocus}
          maxLength={field.key === 'name' ? 60 : 200}
          keyboardType={
            field.field_type === 'email'
              ? 'email-address'
              : field.field_type === 'phone'
                ? 'phone-pad'
                : field.field_type === 'number'
                  ? 'numbers-and-punctuation'
                  : 'default'
          }
          autoCapitalize={field.field_type === 'email' ? 'none' : field.field_type === 'text' ? 'words' : 'none'}
          autoCorrect={false}
        />
      )}
    </FormField>
  );
}
