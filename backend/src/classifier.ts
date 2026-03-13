// Auto-classify prompts by type using heuristics (no LLM needed)

export type PromptType = "system" | "task" | "template" | "chain" | "reference" | "snippet";

interface ClassificationResult {
  type: PromptType;
  confidence: number; // 0-1
  reason: string;
}

interface StructureSection {
  name: string;
  detected: boolean;
  lines?: [number, number]; // [start, end] line numbers
}

export interface StructureAnalysis {
  sections: StructureSection[];
  score: number; // 0-6 (how many sections detected)
  total: number;
  suggestions: string[];
}

const SYSTEM_PATTERNS = [
  /^you are (a|an|the) /im,
  /^act as /im,
  /^your role is/im,
  /^you('re| are) (a |an )?(\w+ )*(assistant|expert|analyst|advisor|consultant|professor|engineer|specialist)/im,
  /^<role>/im,
  /persona:/im,
  /^## role/im,
  /^# system prompt/im,
];

const TEMPLATE_PATTERNS = [
  /\{\{[^}]+\}\}/,
  /\[YOUR [^\]]+\]/i,
  /\[INSERT [^\]]+\]/i,
  /\{[A-Z_]+\}/,
  /\[PLACEHOLDER\]/i,
  /\[TOPIC\]/i,
  /\[SUBJECT\]/i,
];

const CHAIN_PATTERNS = [
  /step\s+[1-9][\s:]/im,
  /phase\s+[1-9][\s:]/im,
  /stage\s+[1-9][\s:]/im,
  /^1\.\s+.*\n.*^2\.\s+/ms,
  /first,?\s+.*then,?\s+.*finally/is,
  /→|->.*→|->/,
];

const REFERENCE_PATTERNS = [
  /^#\s+.+\n/m, // Markdown heading
  /\bhttps?:\/\/\S+/g,
  /\bcitation\b/i,
  /\bsource\b/i,
  /\baccording to\b/i,
  /\bresearch shows\b/i,
];

const SNIPPET_INDICATORS = {
  maxLength: 500,
  patterns: [
    /^respond in/im,
    /^always /im,
    /^never /im,
    /^format:/im,
    /^output format/im,
    /^constraints:/im,
    /^rules:/im,
  ],
};

export function classifyPrompt(title: string, content: string): ClassificationResult {
  const text = `${title}\n${content}`.toLowerCase();
  const contentLen = content.length;

  // Score each type
  const scores: Record<PromptType, number> = {
    system: 0,
    task: 0,
    template: 0,
    chain: 0,
    reference: 0,
    snippet: 0,
  };

  // System prompt detection
  for (const pat of SYSTEM_PATTERNS) {
    if (pat.test(content)) scores.system += 2;
  }
  if (content.match(/<role>/i) && content.match(/<\/role>/i)) scores.system += 3;

  // Template detection
  let templateVarCount = 0;
  for (const pat of TEMPLATE_PATTERNS) {
    const matches = content.match(pat);
    if (matches) {
      templateVarCount += matches.length;
      scores.template += 2;
    }
  }
  if (templateVarCount >= 3) scores.template += 3;

  // Chain detection
  for (const pat of CHAIN_PATTERNS) {
    if (pat.test(content)) scores.chain += 2;
  }
  // Count numbered steps
  const numberedSteps = content.match(/^\d+\.\s+/gm);
  if (numberedSteps && numberedSteps.length >= 3) scores.chain += 2;

  // Reference detection
  if (contentLen > 3000) scores.reference += 2;
  if (contentLen > 8000) scores.reference += 2;
  const linkCount = (content.match(/https?:\/\/\S+/g) || []).length;
  if (linkCount >= 3) scores.reference += 3;
  // No imperative verbs suggests reference/reading material
  const hasImperatives = /\b(create|write|generate|analyze|build|make|design|list|explain|summarize)\b/i.test(content);
  if (!hasImperatives && contentLen > 2000) scores.reference += 2;
  if (/^#\s+.+/m.test(content) && /^##\s+.+/m.test(content)) scores.reference += 1;

  // Snippet detection
  if (contentLen < SNIPPET_INDICATORS.maxLength) {
    scores.snippet += 2;
    for (const pat of SNIPPET_INDICATORS.patterns) {
      if (pat.test(content)) scores.snippet += 1;
    }
  }

  // Task is the default — boost if it has action-oriented language
  if (hasImperatives) scores.task += 1;
  if (/\byou (should|will|must|need to)\b/i.test(content)) scores.task += 1;

  // Find the winner
  const entries = Object.entries(scores) as [PromptType, number][];
  entries.sort((a, b) => b[1] - a[1]);

  const [topType, topScore] = entries[0];
  const [, secondScore] = entries[1];

  // If nothing stands out, default to task
  if (topScore === 0) {
    return { type: "task", confidence: 0.3, reason: "No strong type indicators detected; defaulting to task" };
  }

  const confidence = Math.min(1, topScore / 10);
  const reasons: Record<PromptType, string> = {
    system: "Contains role/persona definition patterns",
    task: "Contains action-oriented instructions",
    template: `Contains ${templateVarCount} variable placeholder(s)`,
    chain: "Contains multi-step sequential workflow",
    reference: "Long-form content with documentation structure",
    snippet: "Short, composable instruction fragment",
  };

  return {
    type: topType,
    confidence,
    reason: reasons[topType],
  };
}

export function analyzeStructure(content: string): StructureAnalysis {
  const lines = content.split("\n");
  const sections: StructureSection[] = [];
  const suggestions: string[] = [];

  // 1. Role/Persona
  const roleMatch = content.match(/^(you are|act as|<role>|persona:|## role)/im);
  sections.push({
    name: "Role/Persona",
    detected: !!roleMatch,
  });
  if (!roleMatch) suggestions.push("Add a role definition (e.g., 'You are a...') for clearer AI behavior");

  // 2. Context
  const contextMatch = content.match(/(given the following|context:|background:|<context>|## context)/im);
  sections.push({
    name: "Context",
    detected: !!contextMatch,
  });
  if (!contextMatch) suggestions.push("Add context or background information to ground the AI's understanding");

  // 3. Instructions
  const instructionMatch = content.match(/(instructions?:|<instructions>|## instructions|your task|please |you (should|will|must|need to))/im);
  sections.push({
    name: "Instructions",
    detected: !!instructionMatch,
  });
  if (!instructionMatch) suggestions.push("Add clear instructions for what the AI should do");

  // 4. Examples
  const exampleMatch = content.match(/(example:|for example|e\.g\.|<examples?>|input:|output:|## example)/im);
  sections.push({
    name: "Examples",
    detected: !!exampleMatch,
  });
  if (!exampleMatch) suggestions.push("Add 2-3 examples for better few-shot performance (typically improves output quality 20-40%)");

  // 5. Output format
  const formatMatch = content.match(/(output.?format|respond in|format:|<output|response format|## output|```)/im);
  sections.push({
    name: "Output Format",
    detected: !!formatMatch,
  });
  if (!formatMatch) suggestions.push("Specify the desired output format (JSON, markdown, bullet points, etc.)");

  // 6. Constraints
  const constraintMatch = content.match(/(do not|never|don't|avoid|constraint|<constraint|## constraint|## rules|important:)/im);
  sections.push({
    name: "Constraints",
    detected: !!constraintMatch,
  });
  if (!constraintMatch) suggestions.push("Add constraints to prevent unwanted behavior (e.g., 'Do not...')");

  const score = sections.filter((s) => s.detected).length;

  return {
    sections,
    score,
    total: sections.length,
    suggestions,
  };
}
