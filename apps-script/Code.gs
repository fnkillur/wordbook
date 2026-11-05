// wordbook 서버: 카드 발음을 Google Cloud Text-to-Speech로 만들어 돌려준다.
// API_TOKEN·TTS_API_KEY는 clasp로 함께 올리는 Secret.gs에 있다(저장소에는 Secret.example.gs만).

const VOICES = {
  ja: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B' },
  en: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
}
const MAX_TEXT_LENGTH = 200

function ttsRequest_(text, language) {
  return { input: { text }, voice: VOICES[language], audioConfig: { audioEncoding: 'MP3' } }
}

function synthesize_(body) {
  const text = String(body.text || '').trim()
  if (!text || text.length > MAX_TEXT_LENGTH) throw new Error('발음을 만들 글자가 올바르지 않아요.')
  if (!VOICES[body.language]) throw new Error('지원하지 않는 언어예요.')

  const response = UrlFetchApp.fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_API_KEY}`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(ttsRequest_(text, body.language)),
    muteHttpExceptions: true,
  })
  if (response.getResponseCode() !== 200) throw new Error(`발음 서비스 오류 (${response.getResponseCode()})`)
  return { audio: JSON.parse(response.getContentText()).audioContent }
}

function authorize_(token) {
  if (typeof API_TOKEN === 'undefined' || !API_TOKEN || token !== API_TOKEN) throw new Error('토큰이 올바르지 않아요.')
}

function handle_(work) {
  let result
  try {
    result = { ok: true, ...work() }
  } catch (error) {
    result = { ok: false, error: String(error.message || error) }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)
}

function doPost(e) {
  return handle_(() => {
    const body = JSON.parse(e.postData.contents)
    authorize_(body.token)
    if (body.action === 'tts') return synthesize_(body)
    throw new Error('알 수 없는 요청이에요.')
  })
}

// 편집기에서 한 번 실행해 외부 요청 권한을 허용하고 키가 동작하는지 본다.
function checkTts() {
  Logger.log(`발음 ${synthesize_({ text: 'テスト', language: 'ja' }).audio.length}바이트를 받았어요.`)
}
