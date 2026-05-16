"use strict";

const OPENAI_URL = "https://api.openai.com/v1/responses";

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
    "You are a planner/controller, not the optical engine. The existing LensBuilder raytrace, metrics, Corner Focus Test, and Auto Tuner are the source of truth.",
    "Never claim you directly optimized optics yourself. Request local tool actions and reason from returned tool results.",
    "Do not rewrite lens JSON. Do not request final application of a result unless the user explicitly asks, and keep apply_candidate requiring approval.",
    "Safety rules: never change OBJ or IMS, sensor W/H, IMS aperture, clear apertures, glass types, or surface labels unless explicitly allowed by the user.",
    "For 50mm F2 full-frame clean requests, default to hard EFL and T locks: EFL target 50mm or current EFL, tolerance +/-0.75mm; T target 2.0 or current T, tolerance +/-0.20; image circle 45mm soft unless hard requested.",
    "For corner sharpness requests: first prefer get_lens_metrics and run_corner_focus_test. If field curvature is likely, suggest field curvature tuner or rear flattener. If coma/astigmatism is likely, suggest Auto Tuner radii/spacing/stop-position with FL/T hard locked.",
    "Return concise assistantMessage plus zero or more safe actions. v1 should usually return one diagnostic action and optionally one tuner action. Do not request set_surface_value except to say it is disabled.",
  ].join("\n");
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
                "run_corner_focus_test",
                "run_auto_tuner",
                "preview_candidate",
                "apply_candidate",
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
    },
    required: ["assistantMessage", "actions"],
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
    sendJson(res, 405, { assistantMessage: "Use POST for /api/lens-ai.", actions: [] });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, {
      assistantMessage: "AI backend is not configured. Set OPENAI_API_KEY on the server.",
      actions: [],
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

    const promptPayload = {
      userMessage: message,
      currentMetrics: metrics,
      currentLensSummary: lensSummary,
      recentAutoTuner,
      recentToolResults: toolResults,
      chatHistory: history,
      availableActions: [
        "get_lens_state",
        "get_lens_metrics",
        "run_corner_focus_test",
        "run_auto_tuner",
        "preview_candidate",
        "apply_candidate",
        "revert_to_original",
        "add_weak_rear_field_flattener",
        "scale_to_focal_length",
        "set_surface_value",
      ],
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
      };
    }

    sendJson(res, 200, {
      assistantMessage: String(parsed.assistantMessage || "I made a safe plan."),
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    });
  } catch (error) {
    sendJson(res, 500, {
      assistantMessage: `AI backend failed: ${error?.message || String(error)}`,
      actions: [],
    });
  }
};
