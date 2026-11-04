import { Button } from '@beachsports/components';
interface BackButtonProps {
  onClick: () => void;
  label: string;
  testId: string;
}
export function BackButton({ onClick, label, testId }: BackButtonProps) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label={label} data-testid={testId}>
      Voltar
    </Button>
  );
}
