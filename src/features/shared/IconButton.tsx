import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

interface IconButtonProps {
  icon: ComponentType<LucideProps>;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export function IconButton({ icon: Icon, label, onClick, active, disabled, className }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`cc-icon-btn ${active ? 'active' : ''} ${className ?? ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

