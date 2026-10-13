import './BackButton.css';

interface BackButtonProps {
  onClick: () => void;
  label: string;
  testId: string;
}

/**
 * Back navigation as an icon-only button, matching the Figma "CaretLeft"
 * affordance used across the Ranking, Seleção and Partidas screens.
 * The visible text is replaced by an accessible label.
 */
export function BackButton({ onClick, label, testId }: BackButtonProps) {
  return (
    <button
      type="button"
      className="back-button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 256 256"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M165.66 202.34a8 8 0 0 1-11.32 11.32l-80-80a8 8 0 0 1 0-11.32l80-80a8 8 0 0 1 11.32 11.32L91.31 128Z" />
      </svg>
    </button>
  );
}
