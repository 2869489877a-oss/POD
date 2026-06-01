import type { ListingGenerationInput } from "@/lib/ai/listing-schema";

export function buildListingPrompt(input: ListingGenerationInput) {
  const schema = `{
  "title": "",
  "description": "",
  "tags": [],
  "bullet_points": [],
  "seo_keywords": [],
  "sku_prefix": ""
}`;

  const systemPrompt = [
    "You are an ecommerce listing assistant for cross-border POD products.",
    "Return English content only.",
    "Return strict JSON only. Do not include markdown, comments, explanations, or extra keys.",
    "Do not use infringing brand words, copyrighted character names, celebrity names, team names, or protected trademarks.",
    "Do not include Disney, Nike, Marvel, Hello Kitty, or confusingly similar brand terms.",
    "The title must be suitable for ecommerce platforms.",
    "Generate exactly 13 tags by default.",
  ].join("\n");

  const userPrompt = [
    "Generate POD product listing information with this exact JSON schema:",
    schema,
    "",
    `Product type: ${input.product_type}`,
    `Theme: ${input.theme}`,
    `Style: ${input.style}`,
    `Target platform: ${input.target_platform}`,
    `Image description: ${input.image_description}`,
    "",
    "Requirements:",
    "- English output.",
    "- Suitable for cross-border POD ecommerce.",
    "- Avoid any copyrighted or trademarked brand references.",
    "- Title should be concise, searchable, and platform-friendly.",
    "- tags must contain exactly 13 short tags.",
    "- bullet_points should be benefit-oriented.",
    "- sku_prefix should be uppercase letters/numbers/hyphens only.",
  ].join("\n");

  return {
    fullPrompt: `${systemPrompt}\n\n${userPrompt}`,
    messages: [
      { content: systemPrompt, role: "system" as const },
      { content: userPrompt, role: "user" as const },
    ],
  };
}

export function buildRepairPrompt(rawResponse: string) {
  return [
    {
      content:
        "You repair malformed AI output into strict JSON. Return only valid JSON with the requested keys. No markdown.",
      role: "system" as const,
    },
    {
      content: [
        "Repair this response into strict JSON with exactly these keys:",
        "title, description, tags, bullet_points, seo_keywords, sku_prefix.",
        "All string arrays must contain strings. Keep English output. Remove forbidden brand words.",
        "",
        rawResponse,
      ].join("\n"),
      role: "user" as const,
    },
  ];
}
