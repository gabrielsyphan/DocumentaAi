export type PageType = "document" | "daily" | "canvas";

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
  created_at: string;
  updated_at: string;
}

export interface PageWithChildren extends Page {
  children: PageWithChildren[];
}
