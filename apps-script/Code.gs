// wordbook 서버: 카드 발음을 Google Cloud Text-to-Speech로 만들어 돌려주고, 폰의 학습 기록을 드라이브에 백업한다.
// API_TOKEN·TTS_API_KEY는 clasp로 함께 올리는 Secret.gs에 있다(저장소에는 Secret.example.gs만).

const VOICES = {
  ja: { languageCode: 'ja-JP', name: 'ja-JP-Chirp3-HD-Puck' },
  en: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Aoede' },
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

// 백업은 이 스크립트를 배포한 사람(하치와레)의 드라이브 wordbook-backup/<사람>/ 폴더에 둔다.
const BACKUP_FOLDER = 'wordbook-backup'
const BACKUP_PEOPLE = ['하치와레', '우사기']
const BACKUP_NAME = /^[A-Za-z0-9._-]{1,80}$/

function childFolder_(parent, name) {
  const found = parent.getFoldersByName(name)
  return found.hasNext() ? found.next() : parent.createFolder(name)
}

function backupFolder_(person) {
  if (BACKUP_PEOPLE.indexOf(person) < 0) throw new Error('알 수 없는 사람이에요.')
  const properties = PropertiesService.getScriptProperties()
  const key = `backupFolder:${person}`
  const saved = properties.getProperty(key)
  if (saved) return DriveApp.getFolderById(saved)
  const lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    const folder = childFolder_(childFolder_(DriveApp.getRootFolder(), BACKUP_FOLDER), person)
    properties.setProperty(key, folder.getId())
    return folder
  } finally {
    lock.releaseLock()
  }
}

function checkNames_(names) {
  names.forEach(name => {
    if (!BACKUP_NAME.test(String(name))) throw new Error('파일 이름이 올바르지 않아요.')
  })
}

function filesNamed_(folder, name) {
  const files = []
  const found = folder.getFilesByName(name)
  while (found.hasNext()) files.push(found.next())
  return files
}

// 새 파일을 먼저 만든 뒤 예전 것을 휴지통으로 보낸다. 중간에 실패해도 예전 파일은 남는다.
function backupPut_(body) {
  const files = body.files || []
  checkNames_(files.map(file => file.name))
  const folder = backupFolder_(body.person)
  files.forEach(file => {
    const previous = filesNamed_(folder, file.name)
    folder.createFile(Utilities.newBlob(Utilities.base64Decode(file.data), file.type, file.name))
    previous.forEach(old => old.setTrashed(true))
  })
  return { saved: files.length }
}

function backupList_(body) {
  const folder = backupFolder_(body.person)
  const files = []
  const found = folder.getFiles()
  while (found.hasNext()) {
    const file = found.next()
    files.push({ name: file.getName(), size: file.getSize() })
  }
  return { files }
}

function backupGet_(body) {
  const names = body.names || []
  checkNames_(names)
  const folder = backupFolder_(body.person)
  const files = []
  names.forEach(name => {
    const found = filesNamed_(folder, name)
    if (found.length === 0) return
    const blob = found[0].getBlob()
    files.push({ name, type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) })
  })
  return { files }
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
    if (body.action === 'backupPut') return backupPut_(body)
    if (body.action === 'backupList') return backupList_(body)
    if (body.action === 'backupGet') return backupGet_(body)
    throw new Error('알 수 없는 요청이에요.')
  })
}

// 편집기에서 한 번 실행해 외부 요청 권한을 허용하고 키가 동작하는지 본다.
function checkTts() {
  Logger.log(`발음 ${synthesize_({ text: 'テスト', language: 'ja' }).audio.length}바이트를 받았어요.`)
}

// 편집기에서 한 번 실행해 드라이브 권한을 허용하고 백업 폴더를 만든다.
function checkBackup() {
  BACKUP_PEOPLE.forEach(person => Logger.log(`${person} 백업 폴더: ${backupFolder_(person).getId()}`))
}
