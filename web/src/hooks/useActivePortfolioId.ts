import { useParams } from 'react-router-dom';

export const useActivePortfolioId = (): number | null => {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
