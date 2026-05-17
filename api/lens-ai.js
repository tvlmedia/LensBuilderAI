"use strict";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const {
  retrieveLensKnowledge,
  formatKnowledgeSourcesForPrompt,
  formatKnowledgeSourceList,
} = require("../src/lib/knowledge/retrieveLensKnowledge.js");

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function compactLensSummary(body) {
  const summary = body?.lensSummary && typeof body.lensSummary === "object"
    ? body.lensSummary
    : null;
  if (summary) return summary;
  const lens = body?.lensJson || {};
  const surfaces = Array.isArray(lens.surfaces) ? lens.surfaces : [];
  return {
    name: lens.name || "Untitled lens",
    surfaceCount: surfaces.length,
    surfaces: surfaces.map((s, index) => ({
      index,
      label: String(s?.surfaceLabel || s?.label || s?.type || `S${index}`),
      type: String(s?.type || ""),
      R: numberOrNull(s?.R),
      t: numberOrNull(s?.t),
      ap: numberOrNull(s?.ap),
      glass: String(s?.glass || "AIR"),
      stop: !!s?.stop,
    })),
  };
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeSliceArray(value, limit) {
  return Array.isArray(value) ? value.slice(-limit) : [];
}

function buildInstructions() {
  return [
    "You are the AI Lens Assistant inside TVL LensBuilderAI.",
    "You are an autonomous optical design supervisor and planner/controller, not the optical engine. The existing LensBuilder raytrace, metrics, Corner Focus Test, and Auto Tuner are the source of truth.",
    "Never claim you directly optimized optics yourself. Request local tool actions and reason from returned tool results.",
    "Do not rewrite lens JSON. Do not request final application of a result unless the user explicitly asks, and keep apply_candidate requiring approval.",
    "For reference-lens prompts such as Helios 44-2, Biotar, Cooke Panchro, or Petzval, use build_reference_lens. This creates a controlled starter prescription from a known design family and stages it as a candidate; it is not arbitrary JSON mutation.",
    "Use retrievedKnowledge when it is relevant. Cite sources by sourceName, pageNumber, and sectionTitle in the assistantMessage. Do not expose full copyrighted passages; quote at most short excerpts and mostly paraphrase.",
    "Safety rules: never change OBJ or IMS, sensor W/H, IMS aperture, clear apertures, glass types, or surface labels unless explicitly allowed by the user.",
    "For 50mm F2 full-frame clean requests, default to hard EFL and T locks: EFL target 50mm or current EFL, tolerance +/-0.75mm; T target 2.0 or current T, tolerance +/-0.20; image circle 45mm soft unless hard requested.",
    "For corner sharpness requests: first use get_lens_metrics and run_corner_focus_test. If field curvature is likely, run Auto Tuner preset cornerFlatten with field curvature target, radii, air gaps, stop position, front/rear group spacing, rear spacing, and FL/T hard locked. If coma/astigmatism is likely, run Auto Tuner with radii/air gaps/stop position and FL/T hard locked. If IC/COV is the issue, optimize image circle/COV softly first and do not change clear apertures unless explicitly approved.",
    "When autonomousState.enabled is true, do not ask the user to click every diagnostic or tuner step. Return safe actions directly with autoRunnable true. Stop before approval-required structural or final apply actions.",
    "Default autonomous strategy for 'Make corners sharper but keep 50mm T2 full-frame': metrics -> corner focus test -> one Auto Tuner run with hard EFL/T locks -> analyze result -> another safe tuner strategy if needed -> stop with best candidate or ask approval for rear flattener.",
    "Success criteria: EFL 49.25-50.75mm, T 1.80-2.20, COV YES, corner RMS improved vs original, center RMS not worse by more than 25%, field curvature delta improved if field curvature was detected. IC >=45mm is preferred.",
    "Reject candidates conceptually if FL/T constraints are broken, e.g. a 90mm T3.8 result is unacceptable even if corners look better.",
    "Always summarize what you tried and why. Return exact JSON matching the schema.",
  ].join("\n");
}

function appendKnowledgeSources(assistantMessage, chunks) {
  if (!Array.isArray(chunks) || !chunks.length) return assistantMessage;
  const sourceList = formatKnowledgeSourceList(chunks);
  if (!sourceList) return assistantMessage;
  if (/sources\s*:/i.test(assistantMessage)) return assistantMessage;
  return `${assistantMessage}\n\nSources:\n${sourceList}`;
}

function responseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      assistantMessage: { type: "string" },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            type: {
              type: "string",
              enum: [
                "get_lens_state",
                "get_lens_metrics",
                "build_reference_lens",
                "run_corner_focus_test",
                "suggest_auto_tuner_settings",
                "run_auto_tuner",
                "preview_candidate",
                "copy_best_json",
                "apply_candidate",
                "add_reference_lens",
                "iterate_reference_lens",
                "revert_to_original",
                "add_weak_rear_field_flattener",
                "scale_to_focal_length",
                "set_surface_value",
              ],
            },
            label: { type: "string" },
            rationale: { type: "string" },
            requiresApproval: { type: "boolean" },
            autoRunnable: { type: "boolean" },
            args: {
              type: "object",
              additionalProperties: true,
            },
          },
          required: ["id", "type", "label", "rationale", "requiresApproval", "autoRunnable", "args"],
        },
      },
      shouldContinue: { type: "boolean" },
      stopReason: { type: "string" },
      goalStatus: {
        type: "object",
        additionalProperties: false,
        properties: {
          success: { type: "boolean" },
          confidence: { type: "number" },
          summary: { type: "string" },
        },
        required: ["success", "confidence", "summary"],
      },
    },
    required: ["assistantMessage", "actions", "shouldContinue", "stopReason", "goalStatus"],
  };
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") chunks.push(content.text);
      if (content?.type === "text" && typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, {
      assistantMessage: "Use POST for /api/lens-ai.",
      actions: [],
      shouldContinue: false,
      stopReason: "method_not_allowed",
      goalStatus: { success: false, confidence: 0, summary: "Wrong HTTP method." },
    });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, {
      assistantMessage: "AI backend is not configured. Set OPENAI_API_KEY on the server.",
      actions: [],
      shouldContinue: false,
      stopReason: "missing_openai_api_key",
      goalStatus: { success: false, confidence: 0, summary: "AI backend is not configured." },
    });
    return;
  }

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (typeof req.body === "object" && req.body ? req.body : {});
    const message = String(body.message || "").slice(0, 4000);
    const metrics = body.metrics || {};
    const recentAutoTuner = body.recentAutoTuner || null;
    const toolResults = safeSliceArray(body.toolResults, 5);
    const history = safeSliceArray(body.history, 12);
    const lensSummary = compactLensSummary(body);
    const autonomousState = body.autonomousState || { enabled: false };
    const availableActions = Array.isArray(body.availableActions) && body.availableActions.length
      ? body.availableActions
      : [
          "get_lens_state",
          "get_lens_metrics",
          "build_reference_lens",
          "run_corner_focus_test",
          "suggest_auto_tuner_settings",
          "run_auto_tuner",
          "preview_candidate",
          "copy_best_json",
          "apply_candidate",
          "add_reference_lens",
          "iterate_reference_lens",
          "revert_to_original",
          "add_weak_rear_field_flattener",
          "scale_to_focal_length",
          "set_surface_value",
        ];
    const knowledgeChunks = await retrieveLensKnowledge(message, { topK: 6 }).catch(() => []);

    const promptPayload = {
      userMessage: message,
      currentMetrics: metrics,
      currentLensSummary: lensSummary,
      recentAutoTuner,
      recentToolResults: toolResults,
      chatHistory: history,
      autonomousState,
      availableActions,
      retrievedKnowledge: formatKnowledgeSourcesForPrompt(knowledgeChunks),
    };

    const openaiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_LENS_ASSISTANT_MODEL || "gpt-5.2",
        instructions: buildInstructions(),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(promptPayload),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "lens_ai_assistant_response",
            strict: false,
            schema: responseSchema(),
          },
        },
        max_output_tokens: 1400,
        store: false,
      }),
    });

    if (!openaiResponse.ok) {
      const detail = await openaiResponse.text().catch(() => "");
      sendJson(res, 502, {
        assistantMessage: `OpenAI request failed (${openaiResponse.status}).`,
        actions: [],
        shouldContinue: false,
        stopReason: "openai_request_failed",
        goalStatus: { success: false, confidence: 0, summary: "OpenAI request failed." },
        detail: detail.slice(0, 1200),
      });
      return;
    }

    const data = await openaiResponse.json();
    const text = extractOutputText(data);
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      parsed = {
        assistantMessage: text || "I could not form a structured plan.",
        actions: [],
        shouldContinue: false,
        stopReason: "unstructured_model_output",
        goalStatus: { success: false, confidence: 0.2, summary: "Model returned unstructured output." },
      };
    }

    sendJson(res, 200, {
      assistantMessage: appendKnowledgeSources(String(parsed.assistantMessage || "I made a safe plan."), knowledgeChunks),
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      shouldContinue: !!parsed.shouldContinue,
      stopReason: String(parsed.stopReason || ""),
      goalStatus: {
        success: !!parsed?.goalStatus?.success,
        confidence: numberOrNull(parsed?.goalStatus?.confidence) ?? 0.5,
        summary: String(parsed?.goalStatus?.summary || ""),
      },
    });
  } catch (error) {
    sendJson(res, 500, {
      assistantMessage: `AI backend failed: ${error?.message || String(error)}`,
      actions: [],
      shouldContinue: false,
      stopReason: "backend_error",
      goalStatus: { success: false, confidence: 0, summary: "AI backend failed." },
    });
  }
};
