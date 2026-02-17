import Anthropic from "@anthropic-ai/sdk";

export type Priority = "urgente" | "importante" | "normal";

const URGENTE_KEYWORDS = [
  "hospital",
  "centro de saúde",
  "centro de saude",
  "idoso",
  "lar",
  "criança",
  "crianca",
  "escola",
  "creche",
  "farmácia",
  "farmacia",
  "bomba de água",
  "bomba de agua",
  "diálise",
  "dialise",
  "ventilador",
  "oxigénio",
  "oxigenio",
  "estrada nacional",
  "acesso hospital",
  "ip",
  "ic",
  "poste caído",
  "poste caido",
  "poste partido",
  "fio caído",
  "fio caido",
  "cabo caído",
  "cabo caido",
  "risco elétrico",
  "risco eletrico",
];

const IMPORTANTE_KEYWORDS = [
  "empresa",
  "comércio",
  "comercio",
  "loja",
  "restaurante",
  "abrigo",
  "supermercado",
  "edifício",
  "edificio",
  "bombeiros",
  "quartel",
  "municipal",
  "ponte",
  "acesso",
];

function keywordFallback(
  description: string | null,
  type: string,
  street: string | null,
): Priority {
  const text = [description, type, street]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const kw of URGENTE_KEYWORDS) {
    if (text.includes(kw)) return "urgente";
  }
  for (const kw of IMPORTANTE_KEYWORDS) {
    if (text.includes(kw)) return "importante";
  }
  return "normal";
}

export async function classifyPriority(
  description: string | null,
  type: string,
  street?: string | null,
): Promise<Priority> {
  if (process.env.FEATURE_AI_PRIORITY !== "true") {
    return keywordFallback(description, type, street ?? null);
  }

  try {
    const client = new Anthropic();

    const input = [
      description && `Descrição: ${description}`,
      `Tipo: ${type}`,
      street && `Rua: ${street}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      system:
        "Classifica a prioridade deste reporte de infraestrutura danificada em Portugal. " +
        "Responde APENAS com uma palavra: urgente, importante ou normal.\n" +
        "urgente = hospitais, centros de saúde, lares de idosos, escolas, creches, farmácias, bombas de água, equipamento médico, postes caídos/partidos, fios/cabos caídos, risco elétrico\n" +
        "importante = empresas, comércio, abrigos, supermercados, edifícios públicos, bombeiros\n" +
        "normal = residências comuns",
      messages: [{ role: "user", content: input }],
    });

    const text =
      response.content[0].type === "text"
        ? response.content[0].text.trim().toLowerCase()
        : "";

    if (text === "urgente" || text === "importante" || text === "normal") {
      return text;
    }

    // AI returned unexpected value — fall back to keywords
    return keywordFallback(description, type, street ?? null);
  } catch {
    return keywordFallback(description, type, street ?? null);
  }
}
