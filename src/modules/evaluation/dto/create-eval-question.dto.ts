/**
 * Request contract for adding a curated golden-dataset question.
 */
export interface CreateEvalQuestionDto {
  question: string;
  category: string;
  expectedAnswerKeywords?: string[];
  difficulty?: string;
  notes?: string;
  isActive?: boolean;
}
