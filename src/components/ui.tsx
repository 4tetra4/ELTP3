import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, Info as InfoIcon, X } from "lucide-react";

export function Tooltip({
  children,
  content,
  className = "",
  hoverOnly = false,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  hoverOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const height = bubble.current.offsetHeight;
    const width = Math.min(300, window.innerWidth - 24);
    const above = rect.top >= height + 18;
    setStyle({
      width,
      left: Math.max(
        12,
        Math.min(
          window.innerWidth - width - 12,
          rect.left + rect.width / 2 - width / 2,
        ),
      ),
      top: above ? rect.top - height - 10 : rect.bottom + 10,
    });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);
  return (
    <span
      ref={anchor}
      className={`tooltip-anchor ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(!hoverOnly)}
      onBlur={() => setOpen(false)}
      onPointerDown={hoverOnly ? () => setOpen(false) : undefined}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            className="tooltip-bubble"
            style={style}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

export function Info({ children }: { children: ReactNode }) {
  return (
    <Tooltip content={children}>
      <button
        type="button"
        className="info-button"
        aria-label="More information"
        tabIndex={-1}
      >
        <InfoIcon size={12} strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}

export function Segment<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`segmented ${disabled ? "is-disabled" : ""}`}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          disabled={disabled}
          aria-pressed={value === option.value}
          className={value === option.value ? "is-selected" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  eyebrow,
  description,
  children,
  onClose,
  locked = false,
  action = "OK",
  onAction,
  variant = "",
}: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  locked?: boolean;
  action?: string;
  onAction?: () => void;
  variant?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>(
        "[data-autofocus], input, [data-modal-action]",
      );
      first?.focus();
    }, 40);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!locked) closeRef.current();
      }
      if (event.key === "Tab") {
        const focusable = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ) ?? []),
        ].filter((element) => element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !panel.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !panel.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handleKey, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [locked]);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal-panel ${variant}`}
      >
        {!locked && (
          <button
            type="button"
            className="icon-button modal-close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        )}
        {eyebrow && <div className="modal-eyebrow">{eyebrow}</div>}
        <h2 id={titleId}>{title}</h2>
        {description && <div className="modal-description">{description}</div>}
        {children}
        <div className="modal-footer">
          <button
            type="button"
            className="button button-dark"
            data-modal-action
            onClick={onAction ?? onClose}
          >
            {action}
            {!locked && <ArrowRight size={15} />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(
      onClose,
      Math.min(10000, Math.max(3000, message.length * 45)),
    );
    return () => clearTimeout(timer);
  }, [message, onClose]);
  return (
    <div className="toast" role="status">
      <span className="toast-check">
        <Check size={14} />
      </span>
      {message}
      <button
        type="button"
        className="icon-button"
        onClick={onClose}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function FieldLabel({
  children,
  info,
  htmlFor,
}: {
  children: ReactNode;
  info?: string;
  htmlFor?: string;
}) {
  return (
    <label className="field-label" htmlFor={htmlFor}>
      {children}
      {info && <Info>{info}</Info>}
    </label>
  );
}
