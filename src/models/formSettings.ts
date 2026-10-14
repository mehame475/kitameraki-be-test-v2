export const BUILTIN_FIELD_KEYS = ['title', 'description', 'status', 'priority', 'dueDate', 'tags'] as const;
export type BuiltinFieldKey = (typeof BUILTIN_FIELD_KEYS)[number];

export const CUSTOM_FIELD_TYPES = ['text', 'date', 'datetime', 'email'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** A field on the task form. Built-in fields can be renamed/moved but not removed. */
export type FormField = { id: string; label: string } & (
  | { kind: 'builtin'; key: BuiltinFieldKey }
  | { kind: 'custom'; type: CustomFieldType }
);

/** One visual row of the form: one or two columns. */
export type FormRow = { id: string; fields: FormField[] };

export type FormSettings = { rows: FormRow[] };

export const MAX_FORM_COLUMNS = 2;
