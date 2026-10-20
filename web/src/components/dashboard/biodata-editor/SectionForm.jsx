'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { VALIDATION_MESSAGES, isFieldVisible, validateSection } from '@ghotok/shared';
import { Button, Card, FormMessage } from '@/components/ui';
import { useErrorMessage } from '@/hooks/use-error-message';
import { biodataApi } from '@/lib/api/endpoints';
import { useT } from '@/providers/PreferencesProvider';
import { useToast } from '@/providers/ToastProvider';
import { MY_BIODATA_KEY } from './keys.js';
import { FieldControl } from './FieldControl.jsx';

const initialValues = (section, saved) => {
  const values = { ...(saved ?? {}) };
  for (const f of section.fields)
    if (values[f.key] === undefined && f.defaultValue !== undefined) values[f.key] = f.defaultValue;
  return values;
};

/**
 * Edits one biodata section. Values are checked with the same shared validator
 * the API uses; drafts may be incomplete but never invalid.
 */
export function SectionForm({ section, sections, onSaved, isLast }) {
  const { t, lang } = useT();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(() => initialValues(section, sections?.[section.key]));
  const [errors, setErrors] = useState({});
  const [action, setAction] = useState(null); // which button is saving: 'save' | 'next'

  const all = { ...sections, [section.key]: values };
  const message = (code) => VALIDATION_MESSAGES[code]?.[lang] ?? code;

  const save = useMutation({
    mutationFn: (data) => biodataApi.saveSection(section.key, data),
    onSuccess: (result) => {
      queryClient.setQueryData(MY_BIODATA_KEY, result);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(result.statusChanged ? t('editor.approvedNote') : t('common.saved'));
    },
    onError: (err) => {
      if (err.code === 'VALIDATION_ERROR') setErrors(err.fields);
      else toast.error(errorMessage(err));
    },
  });

  const submit = (advance) => (e) => {
    e?.preventDefault();
    setAction(advance ? 'next' : 'save');
    const { value, errors: found } = validateSection(section.key, values, {
      biodata: sections,
      partial: true,
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    save.mutate(value, { onSuccess: () => advance && onSaved() });
  };

  const setField = (key, value) =>
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // A district belongs to a division: clear it when the division changes.
      for (const f of section.fields) if (f.divisionField === key) next[f.key] = '';
      return next;
    });

  return (
    <Card as="form" onSubmit={submit(!isLast)} noValidate title={section.title[lang]}>
      {section.description && <FormMessage tone="info">{section.description[lang]}</FormMessage>}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {section.fields
          .filter((f) => isFieldVisible(f, all))
          .map((f) => (
            <FieldControl
              key={f.key}
              field={f}
              value={values[f.key]}
              values={values}
              error={errors[f.key] && message(errors[f.key])}
              onChange={(v) => setField(f.key, v)}
            />
          ))}
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-5">
        <Button variant="outline" loading={save.isPending && action === 'save'} onClick={submit(false)}>
          {t('editor.saveSection')}
        </Button>
        {!isLast && (
          <Button type="submit" loading={save.isPending && action === 'next'}>
            {t('editor.saveNext')}
          </Button>
        )}
      </div>
    </Card>
  );
}
