const ARK_API_URL = process.env.ARK_API_URL || "https://ark.cn-beijing.volces.com/api/v3/responses";
const ARK_MODEL = process.env.ARK_MODEL || "doubao-seed-2-0-lite-260428";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "只支持 POST 请求" });
  }

  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    return json(500, { error: "后台还没有配置 ARK_API_KEY" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return json(400, { error: "请求内容不是有效 JSON" });
  }

  if (!body.image || !String(body.image).startsWith("data:image/")) {
    return json(400, { error: "请上传卷子照片" });
  }

  const prompt = buildPrompt(body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const response = await fetch(ARK_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        max_output_tokens: 700,
        input: [
          {
            role: "user",
            content: [
              { type: "input_image", image_url: body.image },
              { type: "input_text", text: prompt }
            ]
          }
        ]
      })
    });
    clearTimeout(timeout);

    const responseText = await response.text();
    const payload = safeJson(responseText);
    if (!response.ok) {
      return json(response.status, {
        error: payload.error?.message || payload.message || `豆包分析失败：${response.status}`,
        status: response.status,
        detail: payload.raw || payload
      });
    }

    const text = extractText(payload);
    const result = parseResult(text);
    return json(200, { result, rawText: text });
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      return json(504, { error: "豆包分析超时。请只拍一道错题的局部照片，照片里尽量不要包含整页卷子。" });
    }
    return json(500, { error: error.message || "后台调用失败" });
  }
};

function buildPrompt(body) {
  return `
你是一位耐心的小学四年级数学老师。请根据图片中的数学题和孩子手写答案，快速找出 1 道最清楚、最确定的错题或疑似错题，并进行错题复盘。

要求：
1. 没有标准答案时，请你先自己解题，再对比孩子的答案。
2. 只分析 1 道题，优先选择你看得最清楚、最确定的题。
3. 看不清的不要胡编，可以在 summary 里提醒重新拍局部照片。
4. 错因要尽量具体，例如：审题不完整、计算错误、单位换算错误、数量关系没理清、概念没掌握、步骤漏写。
5. explanation 要用四年级孩子能听懂的话，控制在 60 字以内。
6. 每道错题生成 3 道同类型强化题，难度接近原题，不要直接给答案。
7. 必须只返回 JSON，不要返回 Markdown，不要包裹代码块，不要输出多余文字。

卷子名称：${body.title || "数学卷子"}
年级：${body.grade || "四年级"}
补充说明：${body.note || "无"}

JSON 格式如下：
{
  "summary": "整体复盘总结，1到3句话",
  "mistakes": [
    {
      "questionNumber": "题号，如第3题；看不清可写空字符串",
      "question": "题目文字，尽量从图片识别",
      "childAnswer": "孩子写的答案，识别不到写空字符串",
      "correctAnswer": "正确答案",
      "reason": "错因分类和具体原因",
      "explanation": "用四年级能听懂的话讲清楚相关知识点",
      "practice": ["同类题1", "同类题2", "同类题3"]
    }
  ]
}
`.trim();
}

function extractText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (typeof payload.text === "string") return payload.text;

  const parts = [];
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const block of content) {
      if (typeof block.text === "string") parts.push(block.text);
      if (typeof block.content === "string") parts.push(block.content);
    }
  }
  return parts.join("\n").trim();
}

function parseResult(text) {
  const fallback = {
    summary: text || "没有拿到有效分析结果，请换一张更清晰的照片重试。",
    mistakes: []
  };

  if (!text) return fallback;
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    parsed.mistakes = Array.isArray(parsed.mistakes) ? parsed.mistakes : [];
    return parsed;
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        parsed.mistakes = Array.isArray(parsed.mistakes) ? parsed.mistakes : [];
        return parsed;
      } catch (_) {
        return fallback;
      }
    }
    return fallback;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: String(text || "").slice(0, 500) };
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}
