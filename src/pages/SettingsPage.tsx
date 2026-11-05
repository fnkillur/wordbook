import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { useState, type ChangeEvent } from 'react'
import { exportArchive, importArchive } from '../backup/archive'
import { dateKey } from '../db/repository'
import { IS_WEB_BUILD, type Person } from '../platform'
import { getSettings, saveSettings, type Settings } from '../settings'
import { backfillAudio } from '../sync/audio'
import { decodeConnectCode } from '../sync/connectCode'

const GOAL_OPTIONS = [10, 15, 20, 30]
const PEOPLE: Person[] = ['하치와레', '우사기']

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const download = (file: File) => {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(file)
  link.download = file.name
  link.click()
  URL.revokeObjectURL(link.href)
}

// 안드로이드 앱은 내려받기 링크가 동작하지 않아 파일로 저장한 뒤 공유 시트를 연다.
const saveNative = async (file: File) => {
  const written = await Filesystem.writeFile({ path: file.name, data: await toBase64(file), directory: Directory.Cache })
  await Share.share({ title: file.name, url: written.uri })
}

// 아이폰 사파리는 누른 직후에만 공유 시트를 열 수 있어서, 파일을 미리 만들어 두고 누르는 순간 바로 연다.
const shareOnWeb = (file: File) => {
  if (!navigator.canShare?.({ files: [file] })) {
    download(file)
    return Promise.resolve()
  }
  return navigator.share({ files: [file], title: file.name }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      download(file)
      return
    }
    throw error
  })
}

function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(getSettings)
  const [connectCode, setConnectCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<File | null>(null)

  const update = (patch: Partial<Settings>) => setSettings(saveSettings(patch))

  const handleConnect = () => {
    const server = decodeConnectCode(connectCode)
    if (!server) {
      setMessage('연결 코드가 올바르지 않아요.')
      return
    }
    update({ server })
    setConnectCode('')
    setMessage('발음 서버에 연결했어요.')
    backfillAudio()
  }

  const handlePrepare = async () => {
    try {
      const file = new File([await exportArchive()], `wordbook-${dateKey(new Date())}.zip`, { type: 'application/zip' })
      if (Capacitor.isNativePlatform()) {
        await saveNative(file)
        return
      }
      setPrepared(file)
    } catch {
      setMessage('백업 파일을 만들지 못했어요.')
    }
  }

  const handleSave = () => {
    if (!prepared) return
    shareOnWeb(prepared)
      .then(() => setPrepared(null))
      .catch(() => setMessage('백업 파일을 저장하지 못했어요.'))
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const result = await importArchive(file)
      setMessage(`가져왔어요: 새로 ${result.added}개, 바뀐 것 ${result.updated}개`)
    } catch {
      setMessage('백업 파일을 읽지 못했어요.')
    }
  }

  return (
    <div className="page">
      <main className="page-content settings-content">
        <h1 className="page-title">설정</h1>
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}

        <section className="form-group">
          {IS_WEB_BUILD && (
            <div className="form-row">
              <span>누구</span>
              <div className="segmented" role="radiogroup" aria-label="누구">
                {PEOPLE.map(person => (
                  <button key={person} type="button" role="radio" aria-checked={settings.person === person} className="segmented-option" onClick={() => update({ person })}>
                    {person}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form-row">
            <span>하루 목표</span>
            <div className="segmented" role="radiogroup" aria-label="하루 목표 시간">
              {GOAL_OPTIONS.map(minutes => (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={settings.goalMinutes === minutes}
                  className="segmented-option"
                  onClick={() => update({ goalMinutes: minutes })}
                >
                  {minutes}분
                </button>
              ))}
            </div>
          </div>
          <SwitchRow label="소리 없이 보기" hint="지하철처럼 소리를 못 켤 때. 듣기 카드는 뒤로 미뤄요" checked={settings.soundOff} onToggle={() => update({ soundOff: !settings.soundOff })} />
          {settings.person === '우사기' && (
            <SwitchRow label="철자 카드" hint="영어 단어를 듣고 쓰는 카드를 더 만들어요" checked={settings.spellCards} onToggle={() => update({ spellCards: !settings.spellCards })} />
          )}
        </section>

        <section className="form-group">
          <div className="form-row form-row-column">
            <span>발음 서버 {settings.server ? '· 연결됨' : ''}</span>
            <div className="connect-row">
              <input className="text-input" placeholder="연결 코드 붙여넣기" value={connectCode} onChange={event => setConnectCode(event.target.value)} />
              <button type="button" className="button" disabled={connectCode.trim() === ''} onClick={handleConnect}>
                연결
              </button>
            </div>
          </div>
        </section>

        <section className="form-group">
          {prepared ? (
            <button type="button" className="form-row form-row-button" onClick={handleSave}>
              저장하기 ({Math.ceil(prepared.size / 1024 / 1024)}MB)
            </button>
          ) : (
            <button type="button" className="form-row form-row-button" onClick={handlePrepare}>
              백업 파일 만들기
            </button>
          )}
          <label className="form-row form-row-button">
            백업 파일 가져오기
            <input type="file" accept=".zip,application/zip" hidden onChange={handleImport} />
          </label>
        </section>
      </main>
    </div>
  )
}

type SwitchRowProps = { label: string; hint: string; checked: boolean; onToggle: () => void }

function SwitchRow({ label, hint, checked, onToggle }: SwitchRowProps) {
  return (
    <div className="form-row">
      <span className="form-row-text">
        {label}
        <small>{hint}</small>
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={onToggle} />
    </div>
  )
}

export default SettingsPage
