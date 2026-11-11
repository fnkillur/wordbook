# 빈칸 문장 카드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회화 빈도 단어에 빈칸 문장 카드(`cloze`)를 붙인다. 첫 "알았어" 다음 날부터 나오고, 원어민 녹음이나 Chirp 3 HD 음성과 함께 복습한다.

**Architecture:** 문장 파일(`scripts/data/sentences-*.txt`)과 미리 받은 녹음(`public/sentence-audio/`)을 빌드 스크립트가 `src/data/sentences-*.json`으로 묶는다. 복습 기록 함수가 첫 "알았어"에서 `cloze` 카드를 다음 날 기한으로 만들고, 문장 음성은 미디어 종류 `sentence`로 따로 저장한다. 학습 화면은 카드 종류가 `cloze`이면 빈칸 문장 화면을 그린다.

**Tech Stack:** React 19, TypeScript, Dexie 4, ts-fsrs, Vitest(jsdom, fake-indexeddb), Node 스크립트, Python(fugashi, `scratchpad/freq-venv`), macOS `afconvert`, `zstd`.

**Spec:** `docs/superpowers/specs/2026-11-09-sentence-cards-design.md`

## Global Constraints

- 코딩 스타일(`~/.claude/coding-style.md`):
  - 컴포넌트·훅은 함수 선언문, 나머지 함수는 화살표 함수.
  - 로컬 서브컴포넌트는 메인 아래에 둔다.
  - early return. 순회 변수에 한 글자 이름을 쓰지 않는다.
  - 분기가 3개 이상이면 함수로 뺀다. 주석은 도메인 이유만 적는다.
- 앱 문구는 친근한 반말.
- 비밀값(토큰·엔드포인트·키·배포 ID)은 코드·로그·대화에 넣지 않는다.
- 커밋하지 않는다. 다 끝나면 사용자가 검토한 뒤 커밋한다(사용자 규칙).
- 검사 명령:
  - `rtk proxy pnpm exec vitest run`
  - `rtk proxy pnpm exec tsc -b`
  - `rtk proxy pnpm exec oxlint src` (기존 경고 3개만 허용)
- 내려받은 원본(덱, 검색 결과, Tatoeba CSV)은 scratchpad에만 둔다. 저장소에는 결과물(문장 파일, 녹음, 스크립트)만 둔다.
- 녹음 형식: AAC, m4a, 단일 채널, 24kbps(`afconvert -f m4af -d aac -c 1 -b 24000`). MIME `audio/mp4`.

## Review Focus

1. **이미 공부 중인 단어:** `cloze` 카드는 첫 "알았어"에서 한 번만 생겨야 한다. 이미 "알았어"를 받은 단어도 다음 "알았어"에서 생기고, 두 번째부터는 다시 만들지 않는다. → Task 5 테스트.
2. **cloze 카드 자체를 "알았어"로 답할 때:** 그 답으로 cloze가 또 생기면 안 된다. → Task 5 테스트.
3. **음성 없는 cloze 카드:** 오늘 할 카드에서 빠지지 않고, 뒷면에서 재생만 못 한다. 소리 없이 보기 설정이면 자동 재생하지 않는다. → Task 4·7 테스트.
4. **백업:** 문장 음성(m4a)이 백업 파일로 내보내지고 다시 들여올 수 있어야 한다. 확장자가 jpg로 잘못 붙지 않아야 한다. → Task 8 테스트.
5. **기초 625 단어와 문장 없는 빈도 단어:** cloze가 생기지 않아야 한다. → Task 5 테스트.

---

### Task 1: 일본어 빈칸 읽기 칸 채우기 (데이터)

**Files:**
- Create: `scripts/sentences/add_reading.py`
- Modify: `scripts/data/sentences-ja.txt` (다섯째 칸 추가), 머리줄 설명

**Interfaces:**
- Produces: `sentences-ja.txt` 한 줄 `순위|[빈칸] 문장|번역|출처|빈칸 읽기(히라가나)`. Task 3이 읽는다.

- [ ] **Step 1:** `add_reading.py <sentences-ja.txt>`를 만든다.
  - 줄마다 문장 전체를 fugashi(unidic-lite)로 분석한다.
  - 빈칸 범위와 겹치는 토큰의 `kana`(가타카나)를 이어 붙여 히라가나로 바꾼다.
  - 빈칸 글자가 가나뿐이면 그대로 쓴다.
  - 이미 다섯째 칸이 있으면 덮어쓰지 않는다.
  - 실행: `scratchpad/freq-venv/bin/python -I scripts/sentences/add_reading.py scripts/data/sentences-ja.txt`
- [ ] **Step 2:** 모든 줄의 다섯째 칸이 비어 있지 않고 `^[ぁ-ゖー]+$`인지 확인한다.
  - Expected: 위반 0줄.
- [ ] **Step 3:** 사람 검토.
  - 한자가 든 빈칸만 골라 읽기를 훑는다(약 600줄).
  - 문맥상 틀린 읽기(例: 何 なに/なん, 方 ほう/かた, 今日 きょう/こんにち)를 손으로 고친다.
  - 고친 줄 수를 ledger에 적는다.

### Task 2: 원어민 녹음 받기와 압축 (데이터)

**Files:**
- Create: `scripts/sentences/fetch_audio.py`
- Create: `public/sentence-audio/ja/<순위>.m4a`, `public/sentence-audio/en/<순위>.m4a`

**Interfaces:**
- Produces: 녹음이 있는 문장마다 `public/sentence-audio/<lang>/<rank>.m4a` 파일 하나.
  - 파일이 있는지가 곧 "녹음 있음"이다(Task 3).
  - 받지 못한 문장의 순위는 출력 끝에 목록으로 남는다.

- [ ] **Step 1:** `fetch_audio.py --kaishi <apkg> --tatoeba-audio <sentences_with_audio.csv> --immersionkit-js <사이트 스크립트 파일> --out public/sentence-audio`를 만든다. 문장 파일의 출처 칸별로 처리한다.
  - **`K`:**
    - apkg 안 `collection.anki21b`(zstd)를 sqlite로 풀고, 노트 `Word`·`Sentence Audio` 필드에서 문장 음성 이름을 찾는다.
    - 단어 매칭은 문장 원문(괄호 뺀 것)이 노트 `Sentence`(태그 뺀 것)와 같은 노트로 한다.
    - `media`(zstd, protobuf `MediaEntries{repeated MediaEntry{string name=1;...}}`)에서 이름 순번을 찾아, zip 안 그 번호 파일을 꺼낸다.
    - 꺼낸 파일이 zstd 매직(`28 b5 2f fd`)으로 시작하면 한 번 더 푼다.
  - **`I<id>`:**
    - id는 `<분류>_<슬러그>_<번호>`이다.
    - 슬러그→표시 제목은 사이트 스크립트에서 정규식 `(\w+):\{title:"([^"]+)",category:"(\w+)"`로 얻는다.
    - sound 파일 이름은 `https://apiv2.immersionkit.com/search?q=<단어>` 결과에서 같은 id의 `sound`로 얻는다(scratchpad의 검색 결과 캐시를 `--immersionkit-cache`로 받아 재사용).
    - 주소는 `https://immersionkit.s3.bhs.io.cloud.ovh.net/media/<분류>/<표시 제목>/media/<sound>`(URL 인코딩)이다.
  - **`T<id>`:**
    - CSV(탭 구분, 1열 문장 번호, 2열 오디오 번호)에서 오디오 번호를 찾는다.
    - `https://tatoeba.org/audio/download/<오디오 번호>`에서 받는다.
  - **공통:**
    - 받은 원본은 scratchpad 임시 폴더에 둔다.
    - `afconvert -f m4af -d aac -c 1 -b 24000`으로 `<out>/<lang>/<rank>.m4a`를 만든다.
    - 이미 있으면 건너뛴다. 요청 사이 0.3초 쉰다.
    - 실패한 순위를 모아 마지막에 출력한다.
- [ ] **Step 2:** 실행한다.
  - Expected:
    - 일본어 K 618 + I 316, 영어 T 187에 가까운 파일 수.
    - 실패 목록이 출력된다.
    - `du -sh public/sentence-audio`가 25MB 이하.
- [ ] **Step 3:** 실패한 순위는 그대로 둔다. Task 3이 "녹음 없음"으로 처리해 TTS를 쓴다. 실패 수를 ledger에 적는다.
- [ ] **Step 4:** 무작위 5개(일·영)를 `afplay`로 재생해 끝까지 나오는지 확인한다. 내용이 문장과 맞는지는 사용자 확인 항목으로 남긴다.

### Task 3: 문장 데이터 빌드

**Files:**
- Modify: `scripts/build-words.mjs`
- Create: `src/data/sentences-ja.json`, `src/data/sentences-en.json` (생성물)
- Create: `src/data/sentences.ts`
- Test: `src/data/sentences.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Sentence = { before: string; answer: string; after: string; reading: string | null; translation: string; audioPath: string | null }
  export const findSentence: (wordId: string) => Sentence | null
  ```
  - `audioPath`: `sentence-audio/<lang>/<rank>.m4a`(앞 `/` 없이). 녹음 파일이 없으면 `null`.
  - `reading`: 일본어만 있고, 영어는 `null`.
  - JSON 모양: `{ [wordId]: Sentence }`. wordId는 `ja-f00123` 꼴로, 단어와 같은 규칙이다.

- [ ] **Step 1: 실패하는 테스트**
  - `findSentence('ja-f00001')`이 다음과 같다: `before`가 `彼はテニスを`, `answer`가 `します`, `after`가 `。`, `reading`이 `します`, `translation`이 비어 있지 않음.
  - `findSentence('en-f00001')`의 `answer`가 `get`이고 `reading`이 `null`이다.
  - 기초 단어 `ja-0001`은 `null`이다.
  - learn에서 뺀 단어(`en-f00104`)도 `null`이다.
  - 모든 문장이 `before + answer + after`로 원문을 이룬다. `answer`는 비어 있지 않다.
  - 모든 `audioPath`가 가리키는 파일이 `public/`에 있다(테스트에서 `fs.existsSync`).
- [ ] **Step 2:** `rtk proxy pnpm exec vitest run src/data/sentences.test.ts`
  - Expected: FAIL (모듈 없음).
- [ ] **Step 3:** `build-words.mjs`에 문장 단계를 더한다.
  - 문장 파일을 읽어 빈칸으로 나누고, 출처가 `self`·`D`가 아니며 `public/sentence-audio/<lang>/<rank>.m4a`가 있을 때만 `audioPath`를 넣는다.
  - 다음 경우 오류로 멈춘다:
    - 대괄호 쌍이 1개가 아님
    - learn 목록에 없는 순위
    - 일본어 읽기 칸이 비었거나 가나가 아님
  - `src/data/sentences.ts`가 JSON을 가져와 `findSentence`를 낸다.
  - 실행: `node scripts/build-words.mjs`
- [ ] **Step 4:** 위 테스트를 실행한다.
  - Expected: PASS.

### Task 4: 카드 종류 `cloze`

**Files:**
- Modify: `src/domain/schedule.ts`
- Test: `src/domain/schedule.test.ts`

**Interfaces:**
- Produces:
  - `CardType`에 `'cloze'`를 더한다. `TYPE_ORDER`의 맨 뒤.
  - `newStudyCard(wordId, type, now, due?: Date)`: `due`를 주면 그 시각이 기한이다.
  - `export const startOfNextDay = (now: Date) => Date` (기기 시간 다음 날 0시).

- [ ] **Step 1: 실패하는 테스트**
  - `newStudyCard('ja-f00001', 'cloze', now, startOfNextDay(now)).fsrs.due`가 다음 날 0시이다.
  - 그 카드는 `todayQueue([card], now, …)`에 없고, 다음 날 0시의 `todayQueue`에는 있다.
  - `newWordBudget([card], now, 10)`이 카드가 없을 때와 같은 값이다.
  - `silentWords`에 그 단어가 있어도 cloze는 `todayQueue`에서 빠지지 않는다.
- [ ] **Step 2:** 실행한다. Expected: FAIL.
- [ ] **Step 3:** 구현한다. 소리 카드 거르기(`SOUND_TYPES`)에는 cloze를 넣지 않는다.
- [ ] **Step 4:** 실행한다. Expected: PASS. 기존 schedule 테스트도 PASS.

### Task 5: 첫 "알았어"에서 cloze 만들기와 문장 음성 저장소

**Files:**
- Modify: `src/db/database.ts` (`MediaKind`에 `'sentence'`)
- Modify: `src/db/repository.ts`
- Test: `src/db/repository.test.ts`

**Interfaces:**
- Consumes:
  - Task 3 `findSentence`
  - Task 4 `startOfNextDay`, `newStudyCard(…, due)`
- Produces:
  - `recordReview(cardId, grade, now): Promise<string | null>`: cloze를 새로 만들었으면 그 단어 id, 아니면 `null`. 기존 호출부는 반환값을 무시해도 된다.
  - `setSentenceAudio(wordId: string, audio: Blob): Promise<void>`: 미디어 키 `${wordId}:sentence`.
  - `getMedia(wordId, 'sentence')`: 기존 함수가 그대로 쓰인다.
  - `wordsMissingSentenceAudio(): Promise<string[]>`: cloze 카드가 있는데 `sentence` 미디어가 없는 단어 id.

- [ ] **Step 1: 실패하는 테스트**
  - 빈도 단어 `ja-f00001`을 만들고 produce 카드에 "알았어" →
    - `ja-f00001:cloze` 카드가 생긴다.
    - 기한이 다음 날 0시다.
    - 반환값이 `'ja-f00001'`이다.
  - 같은 단어의 다른 카드에 다시 "알았어" → cloze 개수는 1개 그대로이고, 반환값이 `null`이다.
  - "몰랐어"로는 cloze가 생기지 않는다.
  - cloze 카드 자체에 "알았어" → 새 카드가 생기지 않는다.
  - 기초 단어(`ja-0001`)와 learn에서 뺀 단어에는 생기지 않는다.
  - `wordsMissingSentenceAudio()`가 `['ja-f00001']`이다. `setSentenceAudio` 뒤에는 `[]`이다.
- [ ] **Step 2:** 실행한다. Expected: FAIL.
- [ ] **Step 3:** 구현한다.
  - `recordReview` 트랜잭션 안에서 처리한다. 조건은 `grade === 'good'`, 카드 종류가 cloze 아님, `findSentence(wordId)` 있음, 그 단어의 cloze 카드 없음이다. 이때 `newStudyCard(wordId, 'cloze', now, startOfNextDay(now))`를 넣는다.
- [ ] **Step 4:** 실행한다. Expected: PASS. 전체 테스트도 PASS.

### Task 6: 문장 음성 준비

**Files:**
- Create: `src/sync/sentenceAudio.ts`
- Modify: `src/pages/StudyPage.tsx` (답한 뒤 호출), `src/pages/VillagePage.tsx` (다시 받기 호출)
- Test: `src/sync/sentenceAudio.test.ts`

**Interfaces:**
- Consumes:
  - `findSentence`, `setSentenceAudio`, `wordsMissingSentenceAudio`
  - 기존 `fetchTts(server, text, language)`, `getSettings().server`
- Produces:
  - `prepareSentenceAudio(wordId: string): Promise<boolean>`: 저장했으면 `true`.
    - 녹음 경로가 있으면 `fetch(import.meta.env.BASE_URL + audioPath)`로 받은 Blob을 저장한다.
    - 없거나 실패하면, 서버 설정이 있을 때 `fetchTts(server, before+answer+after, language)`로 받아 저장한다.
    - 둘 다 안 되면 `false`.
  - `backfillSentenceAudio(): Promise<number>`: 빠진 단어를 차례로 준비한다. 처음 실패에서 멈춘다(기존 `fillMissingAudio`와 같은 규칙).

- [ ] **Step 1: 실패하는 테스트** (`fetch`와 `fetchTts`는 `vi` 대역)
  - 녹음 경로가 있는 단어 → `fetch`가 `BASE_URL + 'sentence-audio/ja/1.m4a'`로 불리고, `getMedia(id,'sentence')`가 생긴다.
  - 녹음이 없는 영어 `D` 문장 → `fetchTts`가 문장 전체 글자와 `'en'`으로 불린다.
  - 녹음 `fetch`가 404이고 서버 설정이 없으면 → `false`, 저장 없음.
  - `backfillSentenceAudio`는 두 단어 중 첫 단어가 실패하면 1번만 시도하고 0을 반환한다.
- [ ] **Step 2:** 실행한다. Expected: FAIL.
- [ ] **Step 3:** 구현한다.
  - StudyPage: `answer`에서 `recordReview` 반환값이 있으면 `prepareSentenceAudio`를 기다리지 않고 부른다(`void`).
  - VillagePage: `backfillAudio()` 옆에 `backfillSentenceAudio()`를 더한다.
- [ ] **Step 4:** 실행한다. Expected: PASS. StudyPage와 VillagePage 기존 테스트도 PASS.

### Task 7: 빈칸 카드 화면

**Files:**
- Modify: `src/pages/StudyPage.tsx` (CardFace에서 cloze 분기, 새 서브컴포넌트 `ClozeFace`)
- Modify: `src/characters/lines.ts` (`questionOf`의 cloze 문구: `'빈칸에 들어갈 말은?'`)
- Modify: `src/index.css`
- Test: `src/pages/StudyPage.test.tsx`, `src/characters/lines.test.ts`(있으면)

**Interfaces:**
- Consumes:
  - `findSentence`
  - `getMedia(wordId,'sentence')`. `loadQueue`의 `WordMedia`에 `sentenceAudio: Blob | null`을 더한다.

- [ ] **Step 1: 실패하는 테스트** (cloze 카드를 db에 직접 넣고 기한을 과거로)
  - **앞면:**
    - `.cloze-sentence`에 `before`와 `after` 글자가 있고, `answer` 글자는 없다.
    - `.cloze-blank`가 하나 있다.
    - 그림이 있으면 `.study-image`가 보인다.
    - 번역 글자는 없다.
    - 소리 버튼(`.study-sound`)이 없다.
  - **"번역 보기"를 누르면:** 번역 글자가 보인다. 카드 전체가 뒤집히지는 않는다(번역 버튼 클릭이 카드 클릭으로 번지지 않음).
  - **답 보기 후:**
    - `.cloze-answer`에 `answer`가 있다.
    - 일본어면 `reading`이 함께 보인다.
    - 문장 음성이 있으면 `Audio`가 그 Blob URL로 한 번 재생된다.
  - **소리 없이 보기 설정이면:** 뒤집어도 재생하지 않는다.
  - **다음 카드로 넘어가면:** 번역이 다시 가려진다.
  - **말풍선:** `'빈칸에 들어갈 말은?'`
- [ ] **Step 2:** 실행한다. Expected: FAIL.
- [ ] **Step 3:** 구현한다.
  - 빈칸은 글자 수와 무관하게 같은 폭(`.cloze-blank { display:inline-block; width:3em; border-bottom:… }`)이다.
  - 채운 말은 강조색과 굵은 글씨로 한다. 책 페이지 카드 안에 맞춘다.
  - "번역 보기"는 `<span role="button">` 또는 버튼으로 만들고, 카드 버튼 안 클릭 전파를 `stopPropagation`으로 막는다. 기존 소리 버튼과 같은 방식이다.
- [ ] **Step 4:** 실행한다. Expected: PASS. 전체 테스트, `tsc -b`, `oxlint src`도 통과한다.

### Task 8: 백업에 문장 음성 담기

**Files:**
- Modify: `src/backup/archive.ts` (`extensionOf`: `audio/mp4` → `m4a`)
- Test: `src/backup/archive.test.ts`

- [ ] **Step 1: 실패하는 테스트**
  - `${wordId}:sentence` 미디어(`audio/mp4`)가 있는 상태로 내보낸다.
  - zip에 `media/<wordId>-sentence.m4a`가 있다.
  - 비운 db에 들여오면 `getMedia(wordId,'sentence')`의 type이 `audio/mp4`이다.
- [ ] **Step 2:** 실행한다. Expected: FAIL (`.jpg`로 저장됨).
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 실행한다. Expected: PASS. 전체 테스트도 PASS.

### Task 9: 기기 확인과 문서

- [ ] **Step 1:** 전체 검사를 돌린다(`vitest run`, `tsc -b`, `oxlint src`). Expected: 모두 통과하고, 경고는 기존 3개뿐이다.
- [ ] **Step 2:** 웹 개발 서버(5300)에서 화면 캡처로 확인한다(`scratchpad/cdp/shot.mjs`).
  - 데모 데이터로 cloze 카드 하나를 오늘 기한으로 넣고 앞면, 번역 열기, 뒷면을 캡처한다.
  - 폭 360과 840에서 본다.
- [ ] **Step 3:** `docs/superpowers/specs/2026-11-05-wordbook-design.md`에 빈칸 카드 절을 짧게 더하고 새 설계 문서를 가리킨다.
- [ ] **Step 4:** 사용자에게 변경 내용을 보여 주고 검토를 받는다. APK 설치와 커밋은 사용자 요청 시에만 한다.
