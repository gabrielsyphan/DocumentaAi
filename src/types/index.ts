export type PageType = "document" | "daily" | "canvas" | "folder" | "board";

export interface Page {
  id: string;
  parent_id: string | null;
  title: string;
  emoji: string | null;
  content: string | null; // JSON BlockNote blocks
  order_index: number;
  is_favorite: number; // 0 | 1
  type: PageType;
  tags: string[];       // array de tags, ex: ["trabalho", "pessoal"]
  deleted_at: string | null;
  reminder_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageWithChildren extends Page {
  children: PageWithChildren[];
}

export interface PageVersion {
  id: string;
  page_id: string;
  title: string;
  content: string | null;
  saved_at: string;
}

export interface Flashcard {
  id: string;
  page_id: string;
  front: string;
  back: string;
  interval: number;       // dias até próxima revisão
  repetitions: number;    // repetições corretas consecutivas
  ease_factor: number;    // fator de facilidade SM-2
  next_review: string;    // YYYY-MM-DD
  last_reviewed: string | null;
  created_at: string;
}
