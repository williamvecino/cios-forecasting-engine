import { QuestionType } from "./types";

export function classifyQuestion(input: string): QuestionType {
  const text = input.toLowerCase();

  if (/(which|what area|what region|who will|rank|fastest|lead)/.test(text)) {
    return "ranking";
  }

  if (/(vs|versus|faster than|more than|less than|compared to)/.test(text)) {
    return "comparative";
  }

  if (/(exceed|reach|at least|greater than|less than|%)/.test(text)) {
    return "threshold";
  }

  if (/(when|how soon|how long)/.test(text)) {
    return "timing";
  }

  return "binary";
}
