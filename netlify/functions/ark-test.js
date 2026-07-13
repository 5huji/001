const ARK_API_URL = process.env.ARK_API_URL || "https://ark.cn-beijing.volces.com/api/v3/responses";
const ARK_MODEL = process.env.ARK_MODEL || "doubao-seed-2-0-lite-260428";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8"
};

exports.handler = async () => {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    return json(500, { ok: false, stage: "env", error: "没有读取到 ARK_API_KEY" });
  }

  try {
    const response = await fetch(ARK_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "请只回答：测试成功" }
            ]
          }
        ]
      })
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { raw: text.slice(0, 500) };
    }

    if (!response.ok) {
      return json(response.status, {
        ok: false,
        stage: "ark",
        model: ARK_MODEL,
        status: response.status,
        payload
      });
    }

    return json(200, {
      ok: true,
      model: ARK_MODEL,
      payload
    });
  } catch (error) {
    return json(500, {
      ok: false,
      stage: "fetch",
      model: ARK_MODEL,
      error: error.message || String(error)
    });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
}
