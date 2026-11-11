import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { CaretRightIcon, CloudArrowDownIcon, CloudArrowUpIcon, DownloadSimpleIcon, ExamIcon, ExportIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { exportArchive, importArchive } from '../backup/archive'
import { dateKey } from '../db/repository'
import { DEVICE_PERSON, IS_WEB_BUILD, type Language, type Person } from '../platform'
import { getSettings, learningLanguageOf, saveSettings, type Settings } from '../settings'
import { backfillAudio } from '../sync/audio'
import { backfillSentenceAudio } from '../sync/sentenceAudio'
import { decodeConnectCode } from '../sync/connectCode'
import { backupIfDue, backupToDrive, driveBackupState, NO_DRIVE_BACKUP, restoreFromDrive } from '../sync/driveBackup'

// 배우는 언어를 바꾸면 집·책장·테스트·새 단어가 그 언어로 바뀐다. 이미 만든 다른 언어 카드도 복습에는 계속 나온다.
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'ja', label: '일본어' },
  { value: 'en', label: '영어' },
]

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

type DriveWork = { kind: 'backup' | 'restore'; text: string }

const pad = (value: number) => String(value).padStart(2, '0')

const backupTimeOf = (iso: string) => {
  const at = new Date(iso)
  return `${at.getMonth() + 1}월 ${at.getDate()}일 ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

const backupHintOf = (connected: boolean, work: DriveWork | null, lastAt: string | null | undefined) => {
  if (!connected) return '서버를 연결하면 쓸 수 있어'
  if (work?.kind === 'backup') return work.text
  if (lastAt) return `마지막 백업 ${backupTimeOf(lastAt)}`
  return '하루 한 번 저절로 올려'
}

function SettingsPage() {
  const driveState = useLiveQuery(driveBackupState)
  const [settings, setSettings] = useState<Settings>(getSettings)
  const [connectCode, setConnectCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<File | null>(null)
  const [driveWork, setDriveWork] = useState<DriveWork | null>(null)

  const person = settings.person ?? DEVICE_PERSON

  const update = (patch: Partial<Settings>) => setSettings(saveSettings(patch))

  const handleConnect = () => {
    const server = decodeConnectCode(connectCode)
    if (!server) {
      setMessage('연결 코드가 맞지 않아.')
      return
    }
    update({ server })
    setConnectCode('')
    setMessage('서버에 연결했어.')
    backfillAudio()
    backfillSentenceAudio()
    backupIfDue().catch(() => undefined)
  }

  const handleDriveBackup = async () => {
    if (!settings.server) return
    setDriveWork({ kind: 'backup', text: '올리는 중' })
    try {
      await backupToDrive(settings.server, person, new Date(), (done, total) => setDriveWork({ kind: 'backup', text: `올리는 중 ${done}/${total}` }))
      setMessage('드라이브에 백업했어.')
    } catch {
      setMessage('드라이브에 백업하지 못했어. 다음에 다시 해 볼게')
    } finally {
      setDriveWork(null)
    }
  }

  const handleDriveRestore = async () => {
    if (!settings.server) return
    setDriveWork({ kind: 'restore', text: '받는 중' })
    try {
      const result = await restoreFromDrive(settings.server, person, (done, total) => setDriveWork({ kind: 'restore', text: `받는 중 ${done}/${total}` }))
      setMessage(`되살렸어: 새로 ${result.added}개, 바뀐 것 ${result.updated}개`)
    } catch (error) {
      setMessage(error instanceof Error && error.message === NO_DRIVE_BACKUP ? NO_DRIVE_BACKUP : '드라이브에서 되살리지 못했어.')
    } finally {
      setDriveWork(null)
    }
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
      setMessage('백업 파일을 만들지 못했어.')
    }
  }

  const handleSave = () => {
    if (!prepared) return
    shareOnWeb(prepared)
      .then(() => setPrepared(null))
      .catch(() => setMessage('백업 파일을 저장하지 못했어.'))
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const result = await importArchive(file)
      setMessage(`가져왔어: 새로 ${result.added}개, 바뀐 것 ${result.updated}개`)
    } catch {
      setMessage('백업 파일을 읽지 못했어.')
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

        <h2 className="form-group-title">공부</h2>
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
            <span>배우는 언어</span>
            <div className="segmented" role="radiogroup" aria-label="배우는 언어">
              {LANGUAGES.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={learningLanguageOf(settings) === option.value}
                  className="segmented-option"
                  onClick={() => update({ language: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
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
          <SwitchRow label="소리 없이 보기" hint="지하철처럼 소리를 못 켤 때. 듣기 카드는 뒤로 미룰게" checked={settings.soundOff} onToggle={() => update({ soundOff: !settings.soundOff })} />
          {learningLanguageOf(settings) === 'en' && (
            <SwitchRow label="철자 카드" hint="영어 단어를 듣고 쓰는 카드도 만들게" checked={settings.spellCards} onToggle={() => update({ spellCards: !settings.spellCards })} />
          )}
          <Link to="/test" className="form-row form-row-button">
            <ExamIcon size={22} aria-hidden="true" />
            <span className="form-row-label">어휘량 테스트 다시 보기</span>
            <CaretRightIcon size={18} className="form-row-caret" aria-hidden="true" />
          </Link>
        </section>

        <h2 className="form-group-title">서버</h2>
        <section className="form-group">
          <div className="form-row form-row-column">
            <span className="form-row-heading">
              발음·백업 서버
              <span className={`status-badge${settings.server ? ' is-on' : ''}`}>{settings.server ? '연결됨' : '연결 안 됨'}</span>
            </span>
            <div className="connect-row">
              <input className="text-input" placeholder="연결 코드 붙여넣기" value={connectCode} onChange={event => setConnectCode(event.target.value)} />
              <button type="button" className="button button-primary" disabled={connectCode.trim() === ''} onClick={handleConnect}>
                연결
              </button>
            </div>
          </div>
        </section>

        <h2 className="form-group-title">백업</h2>
        <section className="form-group">
          <button type="button" className="form-row form-row-button" disabled={!settings.server || driveWork !== null} onClick={handleDriveBackup}>
            <CloudArrowUpIcon size={22} aria-hidden="true" />
            <span className="form-row-text">
              드라이브에 백업하기
              <small>{backupHintOf(Boolean(settings.server), driveWork, driveState?.lastAt)}</small>
            </span>
          </button>
          <button type="button" className="form-row form-row-button" disabled={!settings.server || driveWork !== null} onClick={handleDriveRestore}>
            <CloudArrowDownIcon size={22} aria-hidden="true" />
            <span className="form-row-text">
              드라이브에서 되살리기
              <small>{driveWork?.kind === 'restore' ? driveWork.text : '폰에 없는 것과 더 최근 것만 가져와'}</small>
            </span>
          </button>
          {prepared ? (
            <button type="button" className="form-row form-row-button" onClick={handleSave}>
              <ExportIcon size={22} aria-hidden="true" />
              <span className="form-row-label">저장하기 ({Math.ceil(prepared.size / 1024 / 1024)}MB)</span>
            </button>
          ) : (
            <button type="button" className="form-row form-row-button" onClick={handlePrepare}>
              <ExportIcon size={22} aria-hidden="true" />
              <span className="form-row-label">백업 파일 만들기</span>
            </button>
          )}
          <label className="form-row form-row-button">
            <DownloadSimpleIcon size={22} aria-hidden="true" />
            <span className="form-row-label">백업 파일 가져오기</span>
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
