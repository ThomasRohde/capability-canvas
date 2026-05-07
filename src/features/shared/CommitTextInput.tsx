import {
  type KeyboardEvent,
  type InputHTMLAttributes,
  useCallback,
  useEffect,
  useState,
} from "react";

interface CommitTextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
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

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = useCallback(() => {
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
