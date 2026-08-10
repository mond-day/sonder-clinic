'use client';

type Option = { value: string; label: string; color?: string };
type Question = {
  id: string;
  code: string;
  label: string;
  helpText?: string;
  type: string;
  required: boolean;
  options?: Option[];
  unit?: string;
  details?: { enabled: boolean; label: string };
};

type AnswerValue = unknown;

export function QuestionRenderer({
  question,
  value,
  onChange,
  readOnly = false,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  readOnly?: boolean;
}) {
  const current = typeof value === 'object' && value && 'value' in (value as object)
    ? (value as { value: unknown; details?: string })
    : { value, details: undefined };
  const setValue = (next: unknown, details = current.details) => {
    if (readOnly) return;
    if (question.details?.enabled || question.type.includes('DETAILS')) {
      onChange({ value: next, details });
      return;
    }
    onChange(next);
  };

  return (
    <div className={`question-block${readOnly ? ' read-only' : ''}`} data-question={question.code}>
      <label>
        <span>
          {question.label}
          {question.required ? ' *' : ''}
        </span>
        {question.helpText ? <small>{question.helpText}</small> : null}
      </label>

      {['YES_NO', 'YES_NO_UNKNOWN', 'YES_NO_DETAILS', 'SINGLE_CHOICE', 'SINGLE_CHOICE_DETAILS', 'RISK_LEVEL'].includes(question.type) ? (
        <div className="choice-pills">
          {(question.options ?? []).map((option) => (
            <button
              key={option.value}
              type="button"
              className={current.value === option.value ? 'active' : ''}
              disabled={readOnly}
              onClick={() => setValue(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {['MULTIPLE_CHOICE', 'MULTIPLE_CHOICE_DETAILS'].includes(question.type) ? (
        <div className="choice-pills multi">
          {(question.options ?? []).map((option) => {
            const selected = Array.isArray(current.value) ? current.value.includes(option.value) : false;
            return (
              <button
                key={option.value}
                type="button"
                className={selected ? 'active' : ''}
                disabled={readOnly}
                onClick={() => {
                  const list = Array.isArray(current.value) ? [...current.value] : [];
                  if (selected) setValue(list.filter((item) => item !== option.value));
                  else setValue([...list, option.value]);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {question.type === 'LONG_TEXT' || question.type === 'SHORT_TEXT' ? (
        question.type === 'LONG_TEXT' ? (
          <textarea
            rows={3}
            value={String(current.value ?? '')}
            readOnly={readOnly}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <input
            value={String(current.value ?? '')}
            readOnly={readOnly}
            onChange={(event) => setValue(event.target.value)}
          />
        )
      ) : null}

      {question.type === 'NUMBER' || question.type === 'NUMBER_UNIT' || question.type === 'SCALE_0_10' ? (
        <div className="inline-field">
          <input
            type="number"
            min={question.type === 'SCALE_0_10' ? 0 : undefined}
            max={question.type === 'SCALE_0_10' ? 10 : undefined}
            value={current.value == null ? '' : String(current.value)}
            readOnly={readOnly}
            onChange={(event) => setValue(event.target.value === '' ? null : Number(event.target.value))}
          />
          {question.unit ? <span>{question.unit}</span> : null}
        </div>
      ) : null}

      {question.type === 'DATE' ? (
        <input
          type="date"
          value={String(current.value ?? '')}
          readOnly={readOnly}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : null}

      {question.type === 'PHONE_CHANNEL' ? (
        <input
          placeholder="Telefone e canal preferencial"
          value={String(current.value ?? '')}
          readOnly={readOnly}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : null}

      {question.type === 'REPEATER_MEDICATION' ? (
        <textarea
          rows={3}
          placeholder="Medicamento, dose e frequência (um por linha)"
          value={String(current.value ?? '')}
          readOnly={readOnly}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : null}

      {question.type === 'ACKNOWLEDGEMENT' ? (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={current.value === true || current.value === 'yes'}
            disabled={readOnly}
            onChange={(event) => setValue(event.target.checked)}
          />
          Concordo
        </label>
      ) : null}

      {(question.details?.enabled || question.type.includes('DETAILS'))
        && (current.value === 'yes' || current.value === true
          || (Array.isArray(current.value) && current.value.length > 0)
          || (typeof current.value === 'string' && !['no', 'never', 'low'].includes(current.value) && current.value !== ''))
        ? (
          <textarea
            rows={2}
            placeholder={question.details?.label ?? 'Detalhes'}
            value={String(current.details ?? '')}
            readOnly={readOnly}
            onChange={(event) => setValue(current.value, event.target.value)}
          />
        ) : null}
    </div>
  );
}
