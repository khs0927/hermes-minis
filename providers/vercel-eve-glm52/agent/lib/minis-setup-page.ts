import { MODEL_ID } from "./openai-compat";

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function minisSetupPage(requestUrl: string): string {
  const origin = new URL(requestUrl).origin;
  const safeOrigin = htmlEscape(origin);
  const originJson = JSON.stringify(origin);
  const modelJson = JSON.stringify(MODEL_ID);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>OpenMinis · Eve GLM-5.2 설정</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 720px; margin: 0 auto; padding: 28px 18px 56px; }
    h1 { font-size: 28px; line-height: 1.15; margin: 0 0 8px; }
    .lead { opacity: .72; margin: 0 0 24px; }
    .card { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 18px; padding: 18px; margin: 14px 0; }
    label { display: block; font-weight: 650; margin-bottom: 8px; }
    input { width: 100%; box-sizing: border-box; padding: 13px 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); font-size: 16px; background: Canvas; color: CanvasText; }
    button { width: 100%; padding: 13px 14px; border: 0; border-radius: 12px; font-size: 16px; font-weight: 700; margin-top: 10px; cursor: pointer; }
    button.primary { background: #2563eb; color: white; }
    button.secondary { background: color-mix(in srgb, CanvasText 10%, transparent); color: CanvasText; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    code { overflow-wrap: anywhere; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: color-mix(in srgb, CanvasText 7%, transparent); padding: 12px; border-radius: 12px; min-height: 24px; }
    .ok { color: #16a34a; }
    .warn { color: #d97706; }
    ol { padding-left: 22px; }
    li { margin: 8px 0; }
    small { opacity: .68; }
  </style>
</head>
<body>
<main>
  <h1>OpenMinis → Eve → GLM-5.2</h1>
  <p class="lead">이 페이지에서 Minis 공급자 파일을 만들 수 있습니다. API 키는 브라우저 안에서만 처리되며 다운로드 파일을 만들 때 사용됩니다.</p>

  <section class="card">
    <strong>배포 주소</strong><br />
    <code id="origin">${safeOrigin}</code><br /><br />
    <strong>모델</strong><br />
    <code>${MODEL_ID}</code>
  </section>

  <section class="card">
    <label for="key">MINIS_BRIDGE_API_KEY</label>
    <input id="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Vercel에 저장한 동일한 키를 붙여넣으세요" />
    <small>Vercel AI Gateway 키를 넣는 곳이 아닙니다. 이 브리지 전용 키만 사용하세요.</small>
    <button class="secondary" id="health">1. Health 확인 (모델 호출 없음)</button>
    <button class="secondary" id="chat">2. GLM-5.2 초소형 테스트 (모델 1회 호출)</button>
    <button class="primary" id="download">3. Minis 공급자 JSON 다운로드</button>
    <pre id="result">대기 중</pre>
  </section>

  <section class="card">
    <strong>Minis에서 가져오기</strong>
    <ol>
      <li>위의 <b>Minis 공급자 JSON 다운로드</b>를 누릅니다.</li>
      <li>Minis → Settings → Providers → Add Provider 로 이동합니다.</li>
      <li><b>Or Import Provider from File</b>을 선택합니다.</li>
      <li>다운로드한 <code>vercel-eve-glm52.minis-provider.json</code> 파일을 선택합니다.</li>
      <li>모델 목록에서 <code>${MODEL_ID}</code>를 선택합니다.</li>
    </ol>
    <small>가져오기 파일은 providerType=openAI, customBaseURL=현재 배포 주소, Append /v1=true 로 생성됩니다. Responses API (v3)는 사용하지 않습니다.</small>
  </section>

  <section class="card">
    <strong class="warn">무료 여부 확인</strong>
    <p>GLM-5.2 테스트가 성공해도 무료 과금이 자동으로 증명되는 것은 아닙니다. Vercel AI Gateway Observability/Usage에서 이 Eve 요청의 실제 비용이 <b>$0</b>인지 확인한 뒤 사용량을 늘리세요.</p>
  </section>
</main>
<script>
(() => {
  const origin = ${originJson};
  const model = ${modelJson};
  const keyInput = document.getElementById('key');
  const result = document.getElementById('result');

  function key() {
    const value = keyInput.value.trim();
    if (!value) throw new Error('MINIS_BRIDGE_API_KEY를 입력하세요.');
    return value;
  }

  function setResult(value, ok) {
    result.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    result.className = ok ? 'ok' : '';
  }

  function utf8Base64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  document.getElementById('health').addEventListener('click', async () => {
    try {
      setResult('Health 확인 중…', true);
      const response = await fetch(origin + '/health', {
        headers: { Authorization: 'Bearer ' + key() },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      setResult(body, true);
    } catch (error) {
      setResult(String(error), false);
    }
  });

  document.getElementById('chat').addEventListener('click', async () => {
    try {
      setResult('GLM-5.2 1회 테스트 중…', true);
      const response = await fetch(origin + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'user', content: '연결 확인. 정확히 READY만 답해.' }],
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      setResult(body, true);
    } catch (error) {
      setResult(String(error), false);
    }
  });

  document.getElementById('download').addEventListener('click', () => {
    try {
      const config = {
        providerType: 'openAI',
        label: 'Vercel Eve GLM-5.2',
        credentialType: 'apiKey',
        customBaseURL: origin,
        appendV1Suffix: true,
        apiKey: utf8Base64(key()),
      };
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vercel-eve-glm52.minis-provider.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResult('공급자 파일을 만들었습니다. Minis의 “Or Import Provider from File”에서 가져오세요.', true);
    } catch (error) {
      setResult(String(error), false);
    }
  });
})();
</script>
</body>
</html>`;
}
