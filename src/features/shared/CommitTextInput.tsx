import {
  type KeyboardEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface CommitTextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> {
  value: string;
  onCommit: (value: string) => void;
  normalize?: (value: string) => string;
}

export function CommitTextInput({
  value,
  onCommit,
  normalize = (nextValue) => nextValue,
  onBlur,
  onKeyDown,
  ...inputProps
}: CommitTextInputProps) {
  const [draft, setDraft] = useState(value);
  const skipCommit = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = useCallback(() => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    const normalized = normalize(draft);
    if (normalized !== normalize(value)) onCommit(normalized);
    setDraft(normalized);
  }, [draft, normalize, onCommit, value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      skipCommit.current = true;
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDraft(value);
    }
  };

  return (
    <input
      {...inputProps}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

interface CommitTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange" | "value"
> {
  value: string;
  onCommit: (value: string) => void;
}

export function CommitTextarea({
  value,
  onCommit,
  onBlur,
  onKeyDown,
  ...textareaProps
}: CommitTextareaProps) {
  const [draft, setDraft] = useState(value);
  const skipCommit = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (draft !== value) onCommit(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      skipCommit.current = true;
      setDraft(value);
      (event.target as HTMLTextAreaElement).blur();
    }
  };

  return (
    <textarea
      {...textareaProps}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

interface CommitNumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value" | "type" | "min" | "max" | "step"
> {
  value: number | "";
  min: number;
  max: number;
  step: number;
  onCommit: (value: number | undefined) => void;
}

export function CommitNumberInput({
  value,
  min,
  max,
  step,
  onCommit,
  onBlur,
  onKeyDown,
  ...inputProps
}: CommitNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const skipCommit = useRef(false);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (draft === "") {
      if (value !== "") onCommit(undefined);
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Enter") {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
    if (event.key === "Escape") {
      skipCommit.current = true;
      setDraft(String(value));
      (event.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      {...inputProps}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

interface BulkNumberFieldProps {
  id: string;
  label: string;
  value: number | "";
  disabled?: boolean;
  title?: string;
  onCommit: (value: number) => void;
}

export function BulkNumberField({
  id,
  label,
  value,
  disabled = false,
  title,
  onCommit,
}: BulkNumberFieldProps) {
  const [draft, setDraft] = useState(value === "" ? "" : String(value));
  const skipCommit = useRef(false);

  useEffect(() => {
    setDraft(value === "" ? "" : String(value));
  }, [value]);

  const commit = () => {
    if (disabled) return;
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (draft === "") return;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(value === "" ? "" : String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <div className="cc-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="cc-input"
        type="number"
        min={1}
        value={draft}
        disabled={disabled}
        title={title}
        placeholder={value === "" ? "Mixed" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            skipCommit.current = true;
            setDraft(value === "" ? "" : String(value));
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
