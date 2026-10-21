import { getDocumentProxy } from "unpdf";
import { BadRequestException } from "../../shared/errors/http-exceptions";

interface TextPiece {
  x: number;
  y: number;
  text: string;
}

// Etiqueta e valor da mesma linha podem vir com alguns pontos de diferença na altura
const SAME_LINE = 5;

/** Junta os pedaços de texto de uma página em linhas, de cima para baixo e da esquerda para a direita. */
export function piecesToLines(pieces: TextPiece[]): string[] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; pieces: TextPiece[] }[] = [];
  for (const piece of sorted) {
    const line = lines.at(-1);
    if (line && line.y - piece.y <= SAME_LINE) line.pieces.push(piece);
    else lines.push({ y: piece.y, pieces: [piece] });
  }
  return lines.map((l) =>
    l.pieces
      .sort((a, b) => a.x - b.x)
      .map((p) => p.text.trim())
      .join(" ")
      .replace(/\s+/g, " "),
  );
}

/** Linhas de texto de um PDF (todas as páginas). PDFs digitalizados (só imagem) não têm texto: 400. */
export async function pdfLines(data: Uint8Array): Promise<string[]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(data);
  } catch {
    throw new BadRequestException("Não foi possível ler o PDF. Confirme que é o documento original do banco.");
  }
  const lines: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent();
    const pieces = items.flatMap((item) =>
      "str" in item && item.str.trim() ? [{ x: item.transform[4] as number, y: item.transform[5] as number, text: item.str }] : [],
    );
    lines.push(...piecesToLines(pieces));
  }
  if (!lines.length) throw new BadRequestException("O PDF não tem texto (parece uma imagem digitalizada). Use o PDF original do banco.");
  return lines;
}
