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

const SCALE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

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
      <label className="question-label">
        <span>
          {question.label}
          {question.required ? <abbr className="question-required" title="Obrigatório">*</abbr> : null}
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
            className="question-input"
            rows={4}
            value={String(current.value ?? '')}
            readOnly={readOnly}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <input
            className="question-input"
            value={String(current.value ?? '')}
            readOnly={readOnly}
            onChange={(event) => setValue(event.target.value)}
          />
        )
      ) : null}

      {question.type === 'SCALE_0_10' ? (
        <div className="scale-field" role="group" aria-label={question.label}>
          <div className="scale-track">
            {SCALE_VALUES.map((score) => (
              <button
                key={score}
                type="button"
                className={Number(current.value) === score ? 'active' : ''}
                disabled={readOnly}
                aria-pressed={Number(current.value) === score}
                onClick={() => setValue(score)}
              >
                {score}
              </button>
            ))}
          </div>
          <div className="scale-ends" aria-hidden>
            <span>Nada</span>
            <span>Máximo</span>
          </div>
        </div>
      ) : null}

      {question.type === 'NUMBER' || question.type === 'NUMBER_UNIT' ? (
        <div className="inline-field">
          <input
            className="question-input question-input-number"
            type="number"
            min={0}
            value={current.value == null ? '' : String(current.value)}
            readOnly={readOnly}
            onChange={(event) => setValue(event.target.value === '' ? null : Number(event.target.value))}
          />
          {question.unit ? <span className="question-unit">{question.unit}</span> : null}
        </div>
      ) : null}

      {question.type === 'DATE' ? (
        <input
          className="question-input question-input-date"
          type="date"
          value={String(current.value ?? '')}
          readOnly={readOnly}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : null}

      {question.type === 'PHONE_CHANNEL' ? (
        <input
          className="question-input"
          placeholder="Telefone e canal preferencial"
          value={String(current.value ?? '')}
          readOnly={readOnly}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : null}

      {question.type === 'REPEATER_MEDICATION' ? (
        <textarea
          className="question-input"
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
            className="question-input question-details"
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
