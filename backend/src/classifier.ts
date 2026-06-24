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
  score: number; // applicable sections detected (out of total)
  total: number; // applicable sections for this prompt type
  missing: string[]; // expected section names that are absent
  suggestions: string[];
}

// Sections that must be present for each prompt type.
// Absent expected sections lower the score; extra sections are neutral.
// TODO: Undecided whether `reference` prompts should be scored at all or just
// stored as reading material. For now gated to [Context] only — revisit before
// adding more expected sections for this type.
const EXPECTED_SECTIONS: Record<PromptType, string[]> = {
  system:    ["Role/Persona", "Instructions"],
  task:      ["Instructions", "Context"],
  chain:     ["Instructions"],
  template:  ["Instructions", "Output Format"],
  snippet:   ["Instructions"],
  reference: ["Context"],
};

const SECTION_SUGGESTIONS: Record<string, string> = {
  "Role/Persona":  "Add a role definition (e.g., 'You are a...') for clearer AI behavior",
  "Context":       "Add context or background information to ground the AI's understanding",
  "Instructions":  "Add clear instructions for what the AI should do",
  "Examples":      "Add 2-3 examples for better few-shot performance (typically improves output quality 20-40%)",
  "Output Format": "Specify the desired output format (JSON, markdown, bullet points, etc.)",
  "Constraints":   "Add constraints to guide behavior (e.g., 'Limit to 3 bullet points', 'Only use sources from...')",
};

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
  const contentLen = content.length;

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
  const numberedSteps = content.match(/^\d+\.\s+/gm);
  if (numberedSteps && numberedSteps.length >= 3) scores.chain += 2;

  // Reference detection
  if (contentLen > 3000) scores.reference += 2;
  if (contentLen > 8000) scores.reference += 2;
  const linkCount = (content.match(/https?:\/\/\S+/g) || []).length;
  if (linkCount >= 3) scores.reference += 3;
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

  const entries = Object.entries(scores) as [PromptType, number][];
  entries.sort((a, b) => b[1] - a[1]);

  const [topType, topScore] = entries[0];

  if (topScore === 0) {
    return { type: "task", confidence: 0.3, reason: "No strong type indicators detected; defaulting to task" };
  }

  const confidence = Math.min(1, topScore / 10);
  const reasons: Record<PromptType, string> = {
    system:    "Contains role/persona definition patterns",
    task:      "Contains action-oriented instructions",
    template:  `Contains ${templateVarCount} variable placeholder(s)`,
    chain:     "Contains multi-step sequential workflow",
    reference: "Long-form content with documentation structure",
    snippet:   "Short, composable instruction fragment",
  };

  return { type: topType, confidence, reason: reasons[topType] };
}

export function analyzeStructure(content: string, type: PromptType): StructureAnalysis {
  const expected = EXPECTED_SECTIONS[type];

  // Detect all sections for display; only expected ones affect score/suggestions.
  const detectedMap: Record<string, boolean> = {
    "Role/Persona":  /(^|\n)\s*(#+\s*role\b|<role>|you are (a|an|the)\b|act as\b)/i.test(content),
    "Context":       /(given the following|context:|background:|<context>|## context)/i.test(content),
    "Instructions":  /(instructions?:|<instructions>|## instructions|your task|please |you (should|will|must|need to))/i.test(content),
    "Examples":      /(example:|for example|e\.g\.|<examples?>|input:|output:|## example)/i.test(content),
    "Output Format": /(output.?format|respond in|format:|<output|response format|## output|```)/i.test(content),
    "Constraints":   /\b(do not|never|don't|avoid|limit(ed)? to|at most|no more than|only use|respond in|keep (it|the response) (to|under))\b/i.test(content),
  };

  const sections: StructureSection[] = Object.entries(detectedMap).map(([name, detected]) => ({
    name,
    detected,
  }));

  const missing = expected.filter((name) => !detectedMap[name]);
  const suggestions = missing.map((name) => SECTION_SUGGESTIONS[name]);
  const score = expected.length - missing.length;

  return {
    sections,
    score,
    total: expected.length,
    missing,
    suggestions,
  };
}
