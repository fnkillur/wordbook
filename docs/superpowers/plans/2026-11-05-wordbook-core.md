# wordbook 계획 1 — 학습 코어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 625 기초 단어로 카드를 직접 만들고(그림·기억 한 줄·TTS 발음), 두 버튼 FSRS로 복습하고, 파일로 백업할 수 있는 앱을 안드로이드 APK와 아이폰 웹앱으로 낸다.

**Architecture:** 가계부(`/Users/teo/Side/ledger`)와 같은 구조를 쓴다. React SPA(해시 라우터)가 모든 학습 데이터를 Dexie(IndexedDB)에 둔다. Capacitor로 안드로이드를 감싸고, 같은 빌드를 GitHub Pages 웹앱으로 낸다. 발음은 별도 Apps Script가 Google Cloud TTS를 대신 불러 mp3를 돌려주고, 앱이 카드에 저장한다. 마을·보수·드라이브 백업은 계획 2에서 한다.

**Tech Stack:** React 19, Vite 8, TypeScript, react-router(createHashRouter), Dexie 4, ts-fsrs, fflate, Capacitor 8 Android, Vitest(jsdom, fake-indexeddb), oxlint, pnpm, Google Apps Script(clasp), Google Cloud Text-to-Speech.

**Spec:** `docs/superpowers/specs/2026-11-05-wordbook-design.md`

## Global Constraints

- 위치 `/Users/teo/Side/wordbook`, 개인 GitHub(`fnkillur/wordbook`), git identity `teo <fnkillur@gmail.com>`, push는 `env -u GITHUB_TOKEN`.
- 실명 금지. 사람은 `하치와레`(일본어, 안드로이드), `우사기`(영어, 아이폰 웹)로만 부른다.
- 비밀값(토큰·엔드포인트·스크립트 ID·TTS API 키)은 저장소·웹 빌드에 넣지 않는다. `apps-script/Secret.gs`, `apps-script/.clasp.json`, `.env*.local`은 gitignore.
- 커밋은 사용자 검토 후, 웹·서버 배포는 사용자가 요청할 때만.
- 치이카와 이미지는 사용자가 준 것만 쓴다(계획 1에서는 쓰지 않는다).
- 코드 스타일은 사용자 전역 규칙(컴포넌트·훅은 함수 선언문, 나머지는 화살표 함수, 주석 최소, early return, 한 글자 순회 변수 금지).
- 화면 문구는 한국어 해요체.

## Review Focus

- 소리 없이 보기를 켠 날 소리 카드(3번)만 남으면 오늘 복습이 끝난 것으로 보여야 한다(막히면 안 된다).
- 같은 단어의 카드 세 장이 같은 날 연달아 나오지 않아야 한다(서로 답이 된다).
- 이미지가 큰 사진(4000px, 5MB)이어도 저장 전에 줄어야 한다.
- TTS 서버가 실패해도 카드 만들기는 저장되고, 발음은 나중에 다시 받을 수 있어야 한다.
- 백업 파일을 가져올 때 기존 데이터와 id가 겹치면 덮어쓰지 않고 최신 것을 남긴다.

---

### Task 1: 프로젝트 뼈대

**Files:**
- Create: 가계부 구성 복사본 — `package.json`, `vite.config.ts`, `tsconfig*.json`, `.oxlintrc.json`, `pnpm-workspace.yaml`, `index.html`, `capacitor.config.ts`(appId `com.teo.wordbook`, appName `wordbook`), `.github/workflows/pages.yml`(Firebase 변수 없이), `.gitignore`
- Create: `src/main.tsx`, `src/router.tsx`, `src/components/TabLayout.tsx`, `src/index.css`(색 토큰, 다크 모드), `src/platform.ts`
- Test: `src/components/TabLayout.test.tsx`

**Interfaces:**
- Produces: `IS_WEB_BUILD: boolean`, `DEVICE_PERSON: Person`(웹 `우사기`, 안드로이드 `하치와레`), `type Person = '하치와레' | '우사기'`, `LANGUAGE_OF: Record<Person, 'ja' | 'en'>`
- Produces: 라우트 `/`(마을), `/words`(단어장), `/collection`(도감), `/settings`, `/study`, `/make/:wordId`

- [ ] **Step 1:** `git init`, 로컬 identity 설정, 가계부 파일을 복사해 이름만 바꾼다. 의존성은 가계부에서 쓰지 않는 것(firebase, recharts, tesseract, biometric, push)을 빼고 `ts-fsrs`, `fflate`를 더한다.
- [ ] **Step 2:** 실패하는 테스트 — 탭 네 개(마을·단어장·도감·설정)가 보이고 지금 경로의 탭에 `active`가 붙는다.
- [ ] **Step 3:** `pnpm exec vitest run src/components/TabLayout.test.tsx` → FAIL(모듈 없음)
- [ ] **Step 4:** TabLayout(탭 이동은 `replace`), 라우터, 빈 페이지들을 만든다.
- [ ] **Step 5:** 테스트 PASS, `pnpm exec tsc -b --noEmit`, `pnpm exec oxlint src` 통과. `npx cap add android` 후 `pnpm android:apk` 성공.

### Task 2: 단어 데이터 (625 × 일본어·영어)

**Files:**
- Create: `scripts/data/` (원본 보관: 625 목록, JMdict 발췌), `scripts/build-words.ts`
- Create: `src/data/words-ja.json`, `src/data/words-en.json`
- Test: `src/data/words.test.ts`

**Interfaces:**
- Produces: `type WordEntry = { id: string; order: number; theme: string; text: string; reading: string; kanji: string | null; meaningKo: string; searchQuery: string }` — `id`는 `ja-0001`처럼 언어+순번. 영어는 `reading`에 IPA, `kanji`는 null.

- [ ] **Step 1:** 실패하는 테스트 — 두 파일 모두 625개, id 중복 없음, `order` 1..625 연속, 빈 `text`·`meaningKo` 없음, 일본어 `reading`은 가나만(`/^[\p{sc=Hiragana}\p{sc=Katakana}ー]+$/u`).
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** 책 저자가 공개한 625 기초 단어 목록(영어, 주제별)을 `scripts/data/base625.json`으로 옮긴다. 일본어는 JMdict(EDRDG, CC BY-SA 4.0, 출처를 README에 적는다)에서 대응어·읽기·한자를 고르고, 뜻은 우리말로 단다. 영어는 단어 그대로, IPA·우리말 뜻을 단다. `build-words.ts`가 검사 후 두 JSON을 쓴다. 애매한 대응은 `scripts/data/review.md`에 모아 사용자 확인 목록으로 남긴다.
- [ ] **Step 4:** PASS.

### Task 3: 복습 일정 (FSRS 두 버튼)

**Files:**
- Create: `src/domain/schedule.ts`
- Test: `src/domain/schedule.test.ts`

**Interfaces:**
- Produces: `type CardType = 'produce' | 'recognize' | 'listen' | 'spell'`, `type Grade = 'again' | 'good'`
- Produces: `type StudyCard = { id: string; wordId: string; type: CardType; fsrs: FsrsState; createdAt: string }`(FsrsState는 ts-fsrs Card를 JSON으로 저장할 수 있게 바꾼 것)
- Produces: `newStudyCard(wordId, type, now): StudyCard`, `gradeCard(card, grade, now): { card: StudyCard; log: ReviewLog }`
- Produces: `todayQueue(cards: StudyCard[], now: Date, options: { soundOff: boolean }): StudyCard[]`
- Produces: `newWordBudget(cards, now, goalMinutes): number`

- [ ] **Step 1:** 실패하는 테스트:
  - `again`은 10분 안쪽, `good`은 하루 이상 뒤로 간다(ts-fsrs 기본 파라미터, `enable_fuzz: false`).
  - `todayQueue`는 기한이 지난 카드만, 오래 밀린 순으로 낸다.
  - 같은 `wordId` 카드는 연달아 나오지 않는다.
  - `soundOff`면 `listen` 카드는 빠진다.
  - `newWordBudget`: 하루 목표 15분, 복습 1장 8초, 새 단어 1개 90초(만들기 포함)로 잡는다. 오늘 복습 예정이 목표를 넘으면 0, 아니면 남은 시간으로 계산하고 최대 10이다.
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현. **Step 4:** PASS.

### Task 4: 로컬 저장소

**Files:**
- Create: `src/db/database.ts`, `src/db/repository.ts`, `src/db/hooks.ts`
- Test: `src/db/repository.test.ts`

**Interfaces:**
- Consumes: Task 3 `StudyCard`, `gradeCard`, `newStudyCard`
- Produces Dexie 테이블:
  - `notes(wordId, image: Blob | null, memo, audio: Blob | null, audioSource: 'tts' | 'forvo' | 'mine' | null, madeAt)`
  - `cards(id, wordId, due)`
  - `reviewLogs(++id, cardId, at)`
  - `wordStates(wordId, status: 'new' | 'known' | 'skipped' | 'made')`
  - `settings(key)`
- Produces:
  - `makeWord(input: { wordId; image: Blob | null; memo: string; cardTypes: CardType[] }, now): Promise<void>` — 노트, 카드, 상태 `made`를 한 트랜잭션에 저장한다.
  - `markWord(wordId, 'known' | 'skipped')`
  - `recordReview(cardId, grade, now)`
  - `setAudio(wordId, blob, source)`
  - `todaysWords(language, budget): WordEntry[]` — 상태가 `new`인 단어를 `order` 순으로.

- [ ] 테스트 → FAIL → 구현 → PASS. 검증할 것:
  - `makeWord` 뒤 카드 수가 `cardTypes` 수와 같다.
  - `todaysWords`가 `known`·`skipped`·`made`를 뺀다.
  - `recordReview`가 due를 옮기고 로그를 남긴다.

### Task 5: 이미지 넣기

**Files:**
- Create: `src/media/image.ts`, `src/media/search.ts`
- Create: `android/app/src/main/java/com/teo/wordbook/ClipboardImagePlugin.java`, `MainActivity.java`(공유 인텐트 `image/*` 받기), `AndroidManifest.xml` 인텐트 필터
- Test: `src/media/image.test.ts`, `src/media/search.test.ts`

**Interfaces:**
- Produces:
  - `fitSize(width, height, max = 800): { width; height }`
  - `compressImage(blob: Blob): Promise<Blob>`(canvas, JPEG 0.8)
  - `googleImageUrl(entry: WordEntry, language): string`
  - `readClipboardImage(): Promise<Blob | null>`(웹: `navigator.clipboard.read()`, 안드로이드: 플러그인)
  - `onSharedImage(callback)`

- [ ] **Step 1:** 실패하는 테스트:
  - `fitSize(4000, 3000)` → `{ width: 800, height: 600 }`, 작은 이미지는 그대로.
  - `googleImageUrl`은 `https://www.google.com/search?tbm=isch&q=<searchQuery 인코딩>&hl=ja|en`.
- [ ] **Step 2:** FAIL. **Step 3:** 구현. 안드로이드 플러그인은 앱이 다시 보일 때 `ClipboardManager`의 이미지 URI를 읽어 base64로 넘긴다. 이미 물어본 클립 내용은 다시 묻지 않는다.
- [ ] **Step 4:** PASS. 폰에서 직접 확인:
  - 구글 이미지에서 복사하고 돌아오면 "넣을까요?"가 뜬다.
  - 갤러리에서 고를 수 있다.
  - 공유로 앱에 보낼 수 있다.

### Task 6: 발음 서버 (Apps Script + Cloud TTS)

**Files:**
- Create: `apps-script/Code.gs`, `apps-script/appsscript.json`, `apps-script/.claspignore`, `apps-script/Secret.example.gs`
- Create: `src/sync/connectCode.ts`(가계부 방식), `src/sync/tts.ts`
- Test: `src/sync/ttsServer.test.ts`(Code.gs 순수 함수를 `node:vm`으로), `src/sync/tts.test.ts`

**Interfaces:**
- Produces 서버:
  - `doPost({ token, action: 'tts', text, language })` → `{ ok: true, audio: base64 mp3 }`
  - 순수 함수 `ttsRequest_(text, language)`: 일본어 `ja-JP-Neural2-B`, 영어 `en-US-Neural2-F`, `audioEncoding: 'MP3'`
- Produces 앱:
  - `fetchTts(settings, text, language): Promise<Blob>`
  - `parseConnectCode(code): { endpoint; token } | null`

- [ ] 테스트 → FAIL → 구현 → PASS. 검증할 것:
  - 서버가 잘못된 토큰을 거절한다.
  - 언어별 목소리를 고른다.
  - 앱이 base64를 `audio/mpeg` Blob으로 바꾼다.
  - 실패하면 예외를 던지고, 카드 만들기 쪽에서 잡아 `audio: null`로 저장한다(Task 7).
- [ ] 사용자 단계: 개인 계정에 Cloud 프로젝트를 만들고 결제 수단·TTS API를 켠 뒤 API 키를 발급한다. 키는 `Secret.gs`에만 넣는다. clasp로 올리고 배포한다(사용자 요청 시).

### Task 7: 카드 만들기 화면

**Files:**
- Create: `src/pages/MakePage.tsx`, `src/pages/WordsPage.tsx`(단어장: 상태별 목록, 다시 만들기)
- Test: `src/pages/MakePage.test.tsx`

**Interfaces:**
- Consumes: Task 4 `makeWord`/`markWord`/`setAudio`/`todaysWords`, Task 5 이미지 함수, Task 6 `fetchTts`
- 카드 종류 기본값: 일본어 `['produce', 'recognize', 'listen']`. 영어는 같고, 설정에서 `spell`을 켜면 더한다.

- [ ] **Step 1:** 실패하는 테스트(jsdom, `fetchTts` 대체):
  - 그림 없이는 '만들기'가 꺼져 있다.
  - 그림을 넣고 만들면 카드 3장이 생기고 다음 단어로 넘어간다.
  - TTS가 실패해도 저장되고 "발음은 나중에 받아요"가 보인다.
  - '알아요'는 `known`이 된다.
- [ ] **Step 2–4:** FAIL → 구현 → PASS.
- [ ] 화면 구성: 단어(가나·한자·IPA), 우리말 뜻(눌러야 보임), 그림 칸, [구글 이미지][갤러리][붙여넣기], 기억 한 줄, 만들기. 아이폰은 붙여넣기 버튼, 안드로이드는 자동 제안.

### Task 8: 복습 화면과 "이어서 하기"

**Files:**
- Create: `src/pages/StudyPage.tsx`, `src/pages/VillagePage.tsx`(계획 1에서는 그림 없이 오늘 할 양 + 이어서 하기), `src/domain/session.ts`
- Test: `src/domain/session.test.ts`, `src/pages/StudyPage.test.tsx`

**Interfaces:**
- Consumes: Task 3 `todayQueue`/`newWordBudget`, Task 4 `recordReview`
- Produces: `nextStep(state: { dueCount; newWordsLeft }): 'review' | 'make' | 'done'`

- [ ] **Step 1:** 실패하는 테스트:
  - 복습이 남으면 `review`, 다 하면 `make`, 둘 다 없으면 `done`.
  - 화면: 앞면(produce: 그림+기억, recognize: 글자+소리, listen: 소리만) → 누르면 뒷면 → [몰랐어요][알았어요]가 아래에 있고 누르면 다음 카드.
  - 소리 없이 보기면 listen 카드가 나오지 않는다.
- [ ] **Step 2–4:** FAIL → 구현 → PASS. 뒷면을 열 때 소리가 켜져 있으면 발음을 튼다.

### Task 9: 설정과 파일 백업

**Files:**
- Create: `src/pages/SettingsPage.tsx`, `src/backup/archive.ts`
- Test: `src/backup/archive.test.ts`

**Interfaces:**
- Produces:
  - `exportArchive(): Promise<Blob>` — fflate zip: `data.json`(노트 메타·카드·로그·상태·설정) + `media/<wordId>.jpg|.mp3`
  - `importArchive(blob): Promise<{ added; updated; skipped }>` — 같은 id면 `updatedAt`·`madeAt`이 더 최근인 쪽을 남긴다.

- [ ] 테스트 → FAIL → 구현 → PASS. 검증할 것:
  - 내보냈다 빈 DB에 가져오면 같다(이미지·소리 바이트 포함).
  - 겹치는 id는 최신이 남는다.
- [ ] 설정 화면에 넣을 것:
  - 사람(웹 첫 실행 때 고름)
  - 하루 목표 시간(기본 15분)
  - 소리 없이 보기
  - 영어 철자 카드 켜기
  - 연결 코드
  - 백업 내보내기·가져오기

### Task 10: 마무리 확인

- [ ] `pnpm exec tsc -b --noEmit`, `pnpm exec oxlint src`, `pnpm exec vitest run` 전부 통과.
- [ ] `pnpm android:apk` → `adb install -r <절대경로>`로 폰 설치. 단어 3개를 만들고 복습하는 흐름을 확인한다.
- [ ] 웹 빌드(`pnpm build:web`)를 로컬 미리보기로 열어 아이폰 크기(390px)에서 같은 흐름을 확인한다.
- [ ] 비밀값 검사(스테이징된 diff에 토큰·엔드포인트·키 없음). 커밋은 사용자 검토 후.
