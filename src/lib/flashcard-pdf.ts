// ── Export de flashcards em PDF de estudo (pdfmake) ──────────────────────────
// Três formatos: folha de estudo (tabela frente|verso para dobrar e se testar),
// cartões recortáveis (grade 2×4 com frente/verso espelhados para impressão
// duplex) e quiz com gabarito (active recall escrevendo).
// Reusa o pdfmake lazy e o salvamento nativo de pdf-export.ts.

import type { Flashcard } from "../types";
import { generateAndSave, stripEmoji, todayLong } from "./pdf-export";
import { safeFileName } from "./flashcard-import";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ACCENT = "#7c6cd8";
const MUTED = "#999999";
const LINE = "#d9d5ce";

// EF inicial do SM-2 é 2.5; abaixo de 2.4 o card já acumulou "difícil"/"errei"
function isHard(card: Flashcard): boolean {
  return card.last_reviewed !== null && card.ease_factor < 2.4;
}

function cleanTitle(title: string): string {
  return stripEmoji(title) || "Flashcards";
}

function headerBlock(label: string, title: string, count: number): any[] {
  return [
    { text: label.toUpperCase(), fontSize: 9, characterSpacing: 2, color: ACCENT, margin: [0, 0, 0, 6] },
    { text: title, fontSize: 21, bold: true, margin: [0, 0, 0, 5] },
    {
      text: `${count} ${count === 1 ? "card" : "cards"} · ${todayLong()} · DocumentaAI`,
      fontSize: 9, color: MUTED, margin: [0, 0, 0, 10],
    },
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 2, lineColor: ACCENT }],
      margin: [0, 0, 0, 16],
    },
  ];
}

function pageFooter(currentPage: number, pageCount: number): any {
  return {
    text: `${currentPage} / ${pageCount}`,
    alignment: "center", fontSize: 9, color: MUTED, margin: [0, 8, 0, 0],
  };
}

// ── 1. Folha de estudo ────────────────────────────────────────────────────────
// Duas colunas (frente | verso) com linha central para dobrar a folha e se
// testar cobrindo as respostas. Cards difíceis ganham ★ e fundo lilás.

export async function exportStudySheetPdf(pageTitle: string, cards: Flashcard[]): Promise<boolean> {
  const title = cleanTitle(pageTitle);
  const hardFlags = cards.map(isHard);

  const body: any[][] = [
    [
      { text: "FRENTE", bold: true, color: "#ffffff", fontSize: 9.5, characterSpacing: 1, margin: [8, 6, 8, 6] },
      { text: "VERSO", bold: true, color: "#ffffff", fontSize: 9.5, characterSpacing: 1, margin: [8, 6, 8, 6] },
    ],
    ...cards.map((card, i) => [
      {
        text: [
          // Roboto não tem o glifo ★ — o marcador de card difícil é um • colorido
          ...(hardFlags[i] ? [{ text: "• ", color: ACCENT, bold: true }] : []),
          { text: card.front, bold: hardFlags[i] },
        ],
        fontSize: 11, margin: [8, 5, 8, 5],
      },
      { text: card.back || "—", fontSize: 11, color: "#444444", margin: [8, 5, 8, 5] },
    ]),
  ];

  const docDefinition = {
    info: { title: `${title} — Folha de estudo`, creator: "DocumentaAI" },
    pageSize: "A4",
    pageMargins: [50, 56, 50, 60],
    footer: pageFooter,
    content: [
      ...headerBlock("Folha de estudo", title, cards.length),
      {
        table: { headerRows: 1, widths: ["*", "*"], body, dontBreakRows: true },
        layout: {
          hLineWidth: (i: number) => (i <= 1 ? 0 : 0.5),
          hLineColor: () => LINE,
          // Só a linha vertical central — é a linha de dobra da folha
          vLineWidth: (i: number) => (i === 1 ? 0.75 : 0),
          vLineColor: () => "#c2bdb4",
          fillColor: (rowIndex: number) => {
            if (rowIndex === 0) return ACCENT;
            if (hardFlags[rowIndex - 1]) return "#f1edfc";
            return rowIndex % 2 === 0 ? "#faf9f6" : null;
          },
        },
      },
      {
        text: [
          ...(hardFlags.some(Boolean)
            ? [{ text: "• ", color: ACCENT, bold: true }, { text: "cards que você mais erra — priorize-os.   " }]
            : []),
          { text: "Dica: dobre a folha na linha central e tente lembrar o verso antes de conferir." },
        ],
        fontSize: 9, color: MUTED, margin: [0, 14, 0, 0],
      },
    ],
  };
  return generateAndSave(docDefinition, `${safeFileName(pageTitle)}-folha-de-estudo.pdf`);
}

// ── 2. Cartões recortáveis ────────────────────────────────────────────────────
// Grade 2×4 por página. Cada grupo de 8 cards gera duas páginas: frentes e
// versos com as colunas espelhadas — imprimindo frente-e-verso (virar na borda
// longa), frente e verso de cada cartão coincidem ao recortar.

const CARDS_PER_ROW = 2;
const ROWS_PER_PAGE = 4;
const CARDS_PER_PAGE = CARDS_PER_ROW * ROWS_PER_PAGE;
const CARD_HEIGHT = 176;

function cardCell(text: string, label: string, hard: boolean): any {
  const long = text.length > 110;
  return {
    stack: [
      {
        text: [
          ...(hard ? [{ text: "• ", color: ACCENT }] : []),
          { text: label, color: "#b9b3aa" },
        ],
        fontSize: 7, characterSpacing: 1.5, alignment: "center", margin: [0, 12, 0, 0],
      },
      {
        text,
        fontSize: long ? 10.5 : 13,
        alignment: "center",
        margin: [14, long ? 28 : 48, 14, 8],
      },
    ],
  };
}

function emptyCell(): any {
  return { text: "" };
}

function cardGrid(rows: any[][], breakBefore: boolean): any {
  return {
    table: { widths: ["*", "*"], heights: CARD_HEIGHT, body: rows },
    layout: {
      hLineWidth: () => 0.7,
      vLineWidth: () => 0.7,
      hLineColor: () => "#b5b0a8",
      vLineColor: () => "#b5b0a8",
      hLineStyle: () => ({ dash: { length: 4, space: 3 } }),
      vLineStyle: () => ({ dash: { length: 4, space: 3 } }),
    },
    ...(breakBefore ? { pageBreak: "before" } : {}),
  };
}

export async function exportCutCardsPdf(pageTitle: string, cards: Flashcard[]): Promise<boolean> {
  const title = cleanTitle(pageTitle);
  const content: any[] = [];

  for (let start = 0; start < cards.length; start += CARDS_PER_PAGE) {
    const group = cards.slice(start, start + CARDS_PER_PAGE);
    const frontRows: any[][] = [];
    const backRows: any[][] = [];

    for (let r = 0; r < ROWS_PER_PAGE; r++) {
      const rowCards = group.slice(r * CARDS_PER_ROW, (r + 1) * CARDS_PER_ROW);
      if (rowCards.length === 0 && r > 0) break; // última página pode ter menos linhas
      const fronts = [0, 1].map((c) =>
        rowCards[c] ? cardCell(rowCards[c].front, "FRENTE", isHard(rowCards[c])) : emptyCell()
      );
      // Colunas espelhadas: no duplex (virar na borda longa) esquerda vira direita
      const backs = [1, 0].map((c) =>
        rowCards[c] ? cardCell(rowCards[c].back || "—", "VERSO", isHard(rowCards[c])) : emptyCell()
      );
      frontRows.push(fronts);
      backRows.push(backs);
    }

    content.push(cardGrid(frontRows, start > 0));
    content.push(cardGrid(backRows, true));
  }

  const docDefinition = {
    info: { title: `${title} — Cartões`, creator: "DocumentaAI" },
    pageSize: "A4",
    pageMargins: [40, 64, 40, 40],
    // Mesmo header em toda página mantém as grades alinhadas entre frente/verso
    header: (currentPage: number) => ({
      text: `${title} — cartões para recortar · ${currentPage % 2 === 1 ? "FRENTES" : "VERSOS"} · imprima frente e verso (virar na borda longa) e recorte nas linhas tracejadas`,
      alignment: "center", fontSize: 8, color: MUTED, margin: [40, 26, 40, 0],
    }),
    content,
  };
  return generateAndSave(docDefinition, `${safeFileName(pageTitle)}-cartoes.pdf`);
}

// ── 3. Quiz com gabarito ──────────────────────────────────────────────────────
// Perguntas numeradas com linha para escrever a resposta; gabarito em página
// separada no final, em duas colunas.

export async function exportQuizPdf(pageTitle: string, cards: Flashcard[]): Promise<boolean> {
  const title = cleanTitle(pageTitle);

  const questions = cards.map((card, i) => ({
    unbreakable: true,
    stack: [
      {
        text: [
          { text: `${i + 1}.  `, bold: true, color: ACCENT },
          { text: card.front, fontSize: 11.5 },
        ],
        margin: [0, 0, 0, 0],
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 420, y2: 0, lineWidth: 0.7, lineColor: "#bbb5ac" }],
        margin: [18, 20, 0, 0],
      },
    ],
    // A margem inferior da última pergunta pode transbordar a página e criar
    // uma página em branco antes do pageBreak do gabarito
    margin: [0, 0, 0, i === cards.length - 1 ? 0 : 16],
  }));

  const answers = cards.map((card, i) => ({
    text: [
      { text: `${i + 1}.  `, bold: true, color: ACCENT },
      { text: card.back || "—" },
    ],
    fontSize: 10.5, margin: [0, 0, 0, 7],
  }));
  const half = Math.ceil(answers.length / 2);

  const docDefinition = {
    info: { title: `${title} — Quiz`, creator: "DocumentaAI" },
    pageSize: "A4",
    pageMargins: [50, 56, 50, 60],
    footer: pageFooter,
    content: [
      ...headerBlock("Quiz", title, cards.length),
      {
        text: "Responda de memória e só depois confira no gabarito da última página.",
        fontSize: 9.5, italics: true, color: MUTED, margin: [0, 0, 0, 18],
      },
      ...questions,
      { text: "Gabarito", fontSize: 17, bold: true, pageBreak: "before", margin: [0, 0, 0, 4] },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 2, lineColor: ACCENT }],
        margin: [0, 4, 0, 16],
      },
      {
        columns: [
          { stack: answers.slice(0, half), width: "*" },
          { stack: answers.slice(half), width: "*" },
        ],
        columnGap: 24,
      },
    ],
  };
  return generateAndSave(docDefinition, `${safeFileName(pageTitle)}-quiz.pdf`);
}
