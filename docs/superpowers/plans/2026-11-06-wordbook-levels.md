# wordbook 두 번째 버전 (수준에 맞는 단어) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 각자 실제 수준에서 시작하도록 앱 안 어휘량 테스트, 자막 기반 회화 빈도 단어, 한꺼번에 '알아요'를 더하고, 공부 화면을 캐릭터 출제 배치(그림 자리만)로 바꾼다.

**Architecture:**
- **데이터 준비(빌드 시점, 빌더 담당):**
  - 파이썬 스크립트가 자막 빈도에서 상위 10,000개 표제어 목록을 만들어 저장소에 고정한다.
  - 빌더가 뜻을 쓴 단어만 Node 빌드 스크립트가 앱 JSON으로 만든다.
- **앱:**
  - 테스트 계산은 순수 함수(`domain/vocabTest.ts`)로 둔다.
  - 시작 위치와 결과는 Dexie `settings`에 저장하고 백업에 포함한다.
  - `todaysWords`가 시작 위치를 읽어 빈도 단어 → 남은 625 순으로 내준다.

**Tech Stack:**
- 앱: React 19, Vite 8, TS 6, Dexie 4, Vitest 5(jsdom, fake-indexeddb), oxlint, pnpm
- 데이터 준비: Python 3(fugashi + unidic-lite, spaCy `en_core_web_sm`, CMUdict). 스크래치 venv에서 돌리고 앱 의존성에는 넣지 않는다.

**Spec:** `docs/superpowers/specs/2026-11-05-wordbook-design.md` — 「수준과 단어 목록」, 「빌더 판단」의 어휘량 테스트·단어 데이터 전달·자막 빈도 출처, 「성취감」의 복습 중 캐릭터(출제 배치)

## Global Constraints

- 실명은 코드·문서·커밋에 넣지 않는다. 캐릭터 이름(하치와레·우사기)만 쓴다.
- 비밀값(토큰·엔드포인트·스크립트 ID·TTS 키)은 저장소·웹 빌드에 넣지 않는다.
- 커밋은 사용자 검토 후 한 번에 한다. 웹 배포(push)와 서버 배포는 사용자가 요청할 때만 한다.
- 치이카와 그림은 사용자가 준 것만 쓴다. 이번 버전은 그림 없이 자리만 만든다.
- 자막 문장은 저장소·앱에 넣지 않는다. 단어·순위·횟수만 넣고 출처를 `scripts/data/SOURCES.md`에 표기한다.
- 테스트: 빈도 1~10,000위, 1,000위 구간 10개, 구간마다 고정 표본 20개 × 두 벌. 다시 볼 때는 다른 벌이 나온다.
- 시작 위치는 아는 비율이 80% 아래로 떨어지는 첫 구간이다. 두 구간 연속 50% 아래면 일찍 끝낸다.
- 빈도 목록에서 625와 같은 단어는 한 번만 나온다(625 쪽에 남긴다).
- 준비된 빈도 단어를 다 쓰면 홈에 "새 단어를 준비하고 있어요"를 보이고, 남은 625 단어와 복습은 계속된다.
- '알아요' 단어는 보수·급수와 무관하다(이번 버전에는 보수·급수 없음).
- 코드 스타일:
  - 컴포넌트·훅은 함수 선언문, 나머지는 화살표 함수
  - 주석은 도메인 이유만, early return
  - 순회 변수에 한 글자 이름 금지
  - 분기 3개 이상이면 함수로 뺀다

## Review Focus

1. **그날 데이터에 없는 단어:** 백업 가져오기나 데이터 재생성으로 단어 데이터에 없는 `wordId`의 카드·상태가 있어도 복습·만들기·단어장이 깨지지 않고 그 카드를 건너뛴다. → Task 1 테스트.
2. **빈도 단어 ID가 바뀌는 문제:** 빈도 목록을 다시 만들어도 이미 만든 단어의 ID(순위 기반)가 바뀌지 않는다. 고정된 TSV를 다시 생성하지 않고 뜻만 늘린다. → Task 2에서 스크립트가 기존 TSV를 덮어쓰지 않게 막는 테스트.
3. **10,000위 안에서 시작 구간이 안 나오는 경우:** 모든 구간이 80% 이상이면 시작 위치는 10,001이고, 준비된 단어가 없으니 "준비하고 있어요"가 뜬다. 앱이 멈추지 않는다. → Task 4, Task 6 테스트.
4. **반응 중 두 번 누르기:** 반응을 보여 주는 동안 버튼을 다시 눌러도 한 번만 기록된다. → Task 1 테스트.
5. **웹에서 사람을 바꾸는 경우:** 테스트·시작 위치·오늘의 단어는 현재 사람의 언어 기준이다. 우사기로 본 테스트가 하치와레 시작 위치를 바꾸지 않는다. → Task 5, Task 6 테스트.

---

### Task 1: 공부 화면을 캐릭터 출제 배치로 (그림 자리만)

사용자가 그림을 넣기 전에 배치를 계속 바꿔 보고 싶어 한다. 그래서 그림 자리를 한곳에 모으고, 그림이 없으면 대체 모습을 보인다.

**Files:**
- Create: `src/characters/slots.ts`, `src/components/Character.tsx`
- Modify: `src/pages/StudyPage.tsx`, `src/index.css`
- Test: `src/pages/StudyPage.test.tsx`

**Interfaces:**
- Produces:
  - `type Pose = 'ask' | 'happy' | 'cheer'`
  - `type Guest = '치이카와' | '모몬가' | '쿠리만쥬'`
  - `characterImage(name: Person | Guest, pose: Pose): string | null` (`slots.ts`): 그림 경로 표. 지금은 전부 `null`.
  - `<Character name pose />`: 그림이 없으면 이름과 동작을 쓴 둥근 대체 모습
  - `questionOf(type: CardType, language: Language): string`
  - `reactionOf(grade: Grade, word: WordEntry): string`
  - 반응 시간 `REACTION_MS = 700`
  - 깜짝 손님은 10장마다(`GUEST_EVERY = 10`)

- [ ] **Step 1: 실패하는 테스트 작성** (`StudyPage.test.tsx`에 추가)
  - `'캐릭터가 카드 종류에 맞는 질문을 말풍선으로 낸다'`
    - produce 카드 하나가 있을 때 `.speech-bubble`에 `이건 일본어로 뭐라고 할까?`가 보인다.
    - 대체 캐릭터(`.character`)의 글자에 `하치와레`가 들어 있다.
  - `'알았어요를 누르면 정답 반응을 보이고 다음 카드로 넘어간다'`
    - 가짜 타이머(`vi.useFakeTimers({ shouldAdvanceTime: true })`)를 쓴다.
    - 답 열기 → 알았어요 → 말풍선에 `정답!`
    - 700ms 진행 → 다음 카드 질문
  - `'반응을 보이는 동안 다시 눌러도 한 번만 기록한다'`
    - 알았어요를 두 번 누르면 `db.reviewLogs.count()`가 1이다.
  - `'데이터에 없는 단어의 카드는 건너뛴다'`
    - `db.cards.put(newStudyCard('ja-f99999', 'produce', past))`와 정상 카드 하나를 넣는다.
    - 진행 표시가 `1 / 1`이다.
  - `'10장째를 답하면 깜짝 손님이 나온다'`
    - 카드 10장을 넣고 모두 답한다.
    - 반응 중 `.guest`가 있다.

- [ ] **Step 2: 실행해 실패 확인**

  Run: `pnpm vitest run src/pages/StudyPage.test.tsx`
  Expected: 새 테스트 5개가 FAIL(`.speech-bubble` 없음 등). 기존 테스트는 PASS.

- [ ] **Step 3: 구현**
  - **화면 배치:** 위 `study-top`(그만하기, 진행) → 캐릭터 + 말풍선 → 문제 카드(눌러서 답 보기) → 아래 고정 몰랐어요/알았어요. 카드 안의 `study-prompt` 문구는 말풍선으로 옮긴다.
  - **질문 문구(`questionOf`):**
    - produce: `이건 {일본어|영어}로 뭐라고 할까?`
    - recognize: `이 단어는 무슨 뜻일까?`
    - listen: `잘 듣고 맞혀 봐!`
    - spell: `듣고 철자를 써 볼래?`
  - **반응 문구(`reactionOf`):**
    - good: `정답! {word.text}`
    - again: `괜찮아, 금방 다시 나올게`
  - **답한 뒤:**
    - 기록하고 `reaction` 상태를 보인다.
    - `REACTION_MS` 뒤 다음 카드로 넘어간다.
    - `isAnswering`은 반응이 끝날 때 푼다.
    - 답한 수가 10의 배수면 반응과 함께 무작위 손님(`.guest`, 대체 모습 + "잘하고 있어!")을 보인다.
  - **건너뛰기:** `loadQueue`에서 `findWord`가 없는 카드는 뺀다.
  - **CSS:**
    - `.character`: 72px 원, 연한 배경, 가운데 글자
    - `.speech-bubble`: `--color-surface`, `--radius-md`, 왼쪽 꼬리
    - `.guest`: 오른쪽 아래에서 올라오는 작은 원(애니메이션 200ms, `prefers-reduced-motion`이면 없음)

- [ ] **Step 4: 실행해 통과 확인**

  Run: `pnpm vitest run src/pages/StudyPage.test.tsx`
  Expected: PASS

- [ ] **Step 5: 전체 확인**

  Run: `pnpm test && pnpm exec tsc -b && pnpm lint`
  Expected: 모두 통과, 린트 경고 0

### Task 2: 회화 빈도 목록 만들기 (데이터 파이프라인)

**Files:**
- Create:
  - `scripts/frequency/requirements.txt`
  - `scripts/frequency/build_ja.py`
  - `scripts/frequency/build_en.py`
  - `scripts/frequency/common.py`
  - `scripts/frequency/test_common.py`
- Create (생성물, 커밋): `scripts/data/freq-ja.tsv`, `scripts/data/freq-en.tsv`, `scripts/data/SOURCES.md`

**Interfaces:**
- Produces: TSV 열 `rank\ttext\treading\tcount`
  - rank: 1부터, 걸러 낸 뒤의 순위
  - 일본어 reading: 히라가나
  - 영어 reading: CMUdict로 만든 IPA. 없으면 빈칸.
  - 상위 10,000행
- `common.py`:
  - `katakana_to_hiragana(text: str) -> str`
  - `rank_rows(counts: dict[str, int], readings: dict[str, str], limit: int) -> list[tuple[int, str, str, int]]`
  - `write_tsv(path, rows, overwrite: bool)`: 파일이 있고 `overwrite=False`면 `FileExistsError`

- [ ] **Step 1: `test_common.py` 작성**
  - `katakana_to_hiragana('タベル') == 'たべる'`
  - `rank_rows({'a':3,'b':5}, {}, 1) == [(1,'b','',5)]`
  - 같은 횟수는 text 오름차순
  - 기존 파일에 `write_tsv(..., overwrite=False)`를 하면 `FileExistsError` (Review Focus 2)

- [ ] **Step 2: 실행해 실패 확인**

  Run: `python3 -I -m pytest scripts/frequency/test_common.py` (스크래치 venv)
  Expected: FAIL (모듈 없음)

- [ ] **Step 3: `common.py` 구현 → 통과 확인**

  Expected: PASS

- [ ] **Step 4: 일본어 빈도 만들기 `build_ja.py <자막 텍스트 경로>`**
  - **원본:** OPUS OpenSubtitles v2018 일본어 단일어 텍스트를 스크래치 디렉터리에 받는다(내려받기 전에 파일 크기를 사용자에게 알린다).
  - **세기:** fugashi + unidic-lite로 형태소를 나누고, 표제어(`lemma`)별로 센다. reading은 `kana`를 히라가나로 바꾼다.
  - **거르기:**
    - 품사: 助詞, 助動詞, 記号, 補助記号, 空白, 感動詞, 名詞-固有名詞, 名詞-数詞, 接頭辞, 接尾辞
    - 한 글자 가나
    - `scripts/data/words.txt`의 625 일본어와 같은 표기
  - **출력:** 상위 10,000개

- [ ] **Step 5: 영어 빈도 만들기 `build_en.py <빈도 목록 경로>`**
  - **원본:** hermitdave FrequencyWords `en_50k.txt`(OpenSubtitles 2018, CC BY-SA 4.0)
  - **세기:** spaCy `en_core_web_sm`으로 단어 하나씩 표제어로 묶어 횟수를 더한다.
  - **거르기:**
    - PROPN, NUM, INTJ, PUNCT
    - 아포스트로피 조각
    - 한 글자(a, I 제외)
    - base625의 영어 표제어
  - **IPA:** CMUdict(ARPAbet → IPA 표)로 만든다.

- [ ] **Step 6: 생성물 확인**

  Run: `head -5 scripts/data/freq-ja.tsv scripts/data/freq-en.tsv && wc -l scripts/data/freq-*.tsv`
  Expected:
  - 각 10,000행
  - 일본어 상위에 する·いる·ある·言う 같은 동사가 있다.
  - 영어 상위에 625에 없는 기능어가 아닌 단어(know, think, get 등)가 있다.
  - 사람 이름이 상위 200에 없다(눈으로 확인하고 걸러 내지 못한 것은 `exclude-*.txt`에 더해 다시 만든다).

- [ ] **Step 7: `SOURCES.md` 작성**
  - 출처, 라이선스(CC BY-SA 4.0, UniDic, CMUdict)
  - "자막 문장은 포함하지 않음"

### Task 3: 테스트 표본과 뜻 준비 (빌더 데이터 작업)

**Files:**
- Create:
  - `scripts/build-vocab.mjs`
  - `scripts/data/test-ja.txt`
  - `scripts/data/test-en.txt`
  - `src/data/vocab-test-ja.json`
  - `src/data/vocab-test-en.json`
- Test: `src/data/vocabData.test.ts`

**Interfaces:**
- Produces:
  - `type TestWord = { rank: number; band: number; set: 0 | 1; text: string; reading: string; meaningKo: string }`
  - `TEST_WORDS: Record<Language, TestWord[]>` (`src/data/vocabTest.ts`). band는 0~9.
- `test-<lang>.txt` 한 줄 형식: `rank|meaningKo`
- 표본 고르기:
  - `build-vocab.mjs --pick`가 구간마다 순위를 고정 시드(언어별 문자열 `wordbook-<lang>`)로 40개 뽑아 빈 뜻 줄로 쓴다.
  - 이미 있는 파일이면 멈춘다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `TEST_WORDS.ja`, `TEST_WORDS.en`이 각 400개다.
  - 구간마다 set 0·1이 20개씩 있다.
  - 모든 `meaningKo`가 비어 있지 않다.
  - rank는 `band*1000+1 ~ (band+1)*1000` 안에 있다.

- [ ] **Step 2: 실행해 실패 확인**

  Run: `pnpm vitest run src/data/vocabData.test.ts`
  Expected: FAIL (모듈 없음)

- [ ] **Step 3: 표본 고르고 뜻 쓰기**
  - `node scripts/build-vocab.mjs --pick`
  - 빌더가 800줄의 우리말 뜻을 쓴다.
    - 짧게 한두 개, 가장 흔한 뜻 먼저
    - 일본어 읽기는 TSV 값을 쓴다.
  - `node scripts/build-vocab.mjs`로 JSON을 만든다.

- [ ] **Step 4: 실행해 통과 확인**

  Run: `pnpm vitest run src/data/vocabData.test.ts`
  Expected: PASS

### Task 4: 어휘량 테스트 계산

**Files:**
- Create: `src/domain/vocabTest.ts`
- Test: `src/domain/vocabTest.test.ts`

**Interfaces:**
- Produces:
  - 상수: `BAND_SIZE = 1000`, `BAND_COUNT = 10`, `PER_BAND = 20`, `START_THRESHOLD = 0.8`, `STOP_THRESHOLD = 0.5`
  - `type BandScore = { band: number; known: number; total: number }`
  - `type VocabTestResult = { takenAt: string; set: 0 | 1; scores: BandScore[]; estimate: number; startRank: number }`
  - `shouldStop(scores: BandScore[]): boolean`
  - `estimateKnown(scores: BandScore[]): number`
  - `suggestStartRank(scores: BandScore[]): number`
  - `nextSet(previousCount: number): 0 | 1`
  - `summarize(scores: BandScore[], set: 0 | 1, now: Date): VocabTestResult`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `shouldStop`:
    - `[{0,18,20},{1,9,20},{2,8,20}]` → true (마지막 두 구간이 50% 아래)
    - `[{0,18,20},{1,9,20}]` → false
  - `estimateKnown([{0,18,20},{1,10,20}]) === 1400`
  - `suggestStartRank`:
    - `[{0,19,20},{1,17,20},{2,15,20}]` → 2001 (80% 아래인 첫 구간 = band 1)
    - 모두 80% 이상인 10구간 → 10001 (Review Focus 3)
    - 빈 배열 → 1
  - `nextSet`: 0 → 0, 1 → 1, 2 → 0

- [ ] **Step 2: 실행해 실패 확인**

  Run: `pnpm vitest run src/domain/vocabTest.test.ts`
  Expected: FAIL

- [ ] **Step 3: 구현**
  - 아는 비율은 `known/total`로 계산한다.
  - 시작 위치는 `band*BAND_SIZE+1`이다.

- [ ] **Step 4: 실행해 통과 확인**

  Run: `pnpm vitest run src/domain/vocabTest.test.ts`
  Expected: PASS

### Task 5: 테스트 화면과 결과 저장

**Files:**
- Create: `src/pages/VocabTestPage.tsx`
- Modify:
  - `src/router.tsx` (`/test`, TabLayout 밖)
  - `src/db/repository.ts`
  - `src/backup/archive.ts`
  - `src/pages/VillagePage.tsx`
  - `src/pages/SettingsPage.tsx`
  - `src/index.css`
- Test:
  - `src/pages/VocabTestPage.test.tsx`
  - `src/db/repository.test.ts`
  - `src/backup/archive.test.ts`

**Interfaces:**
- Consumes: Task 3 `TEST_WORDS`, Task 4 전부
- Produces (`repository.ts`):
  - `vocabTests(language: Language): Promise<VocabTestResult[]>`: 키 `vocabTests:<lang>`
  - `saveVocabTest(language: Language, result: VocabTestResult): Promise<void>`: 목록 끝에 더한다.
  - `startRankOf(language: Language): Promise<number | null>`: 키 `startRank:<lang>`
  - `setStartRank(language: Language, rank: number): Promise<void>`
- 백업: `settings` 중 키가 `vocabTests:`·`startRank:`로 시작하는 행을 `data.json`의 `profile`로 내보낸다. 가져올 때 `vocabTests`는 takenAt 기준으로 합치고, `startRank`는 가져온 값이 있으면 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - **repository:**
    - `saveVocabTest('en', …)` 뒤 `vocabTests('ja')`가 빈 배열이다(Review Focus 5).
    - `setStartRank('ja', 3001)` → `startRankOf('ja') === 3001`, `startRankOf('en') === null`
  - **archive:** 내보낸 뒤 비우고 가져오면 `startRankOf('ja')`와 테스트 기록이 돌아온다. `plan:` 키는 내보내지 않는다.
  - **VocabTestPage** (하치와레):
    - 소개 → `시작` → 첫 단어 `TEST_WORDS.ja`의 band 0·set 0 첫 단어가 보인다.
    - `뜻 보기` → 뜻과 읽기가 보이고 `알았어요`/`몰랐어요`가 나온다.
    - 앞 두 구간 모두 몰랐어요 → 결과 화면 `약 0개` · `1위부터`
    - `여기서 시작할게요` → `startRankOf('ja') === 1`, 홈으로 간다.

- [ ] **Step 2: 실행해 실패 확인**

  Run: `pnpm vitest run src/pages/VocabTestPage.test.tsx src/db/repository.test.ts src/backup/archive.test.ts`
  Expected: 새 테스트 FAIL

- [ ] **Step 3: 구현**
  - **화면 흐름:** 소개("10분쯤 걸려요") → 구간마다 20개(단어 → 뜻 보기 → 알았어요/몰랐어요) → 구간이 끝날 때 `shouldStop`이면 결과로 간다.
  - **결과 화면:**
    - `약 N개를 알아요`
    - 구간별 막대(1~1,000위 …)
    - `{startRank}위부터 시작할게요` 버튼
  - **진입점:**
    - 홈: 테스트 기록이 없으면 `today-card` 위에 "내 단어 수준 알아보기" 카드
    - 설정: "어휘량 테스트 다시 보기" 줄
  - **언어:** 현재 사람(`getSettings().person ?? DEVICE_PERSON`)의 언어를 쓴다.

- [ ] **Step 4: 실행해 통과 확인**

  Run: 같은 명령
  Expected: PASS

- [ ] **Step 5: 전체 확인**

  Run: `pnpm test && pnpm exec tsc -b && pnpm lint`
  Expected: 모두 통과

### Task 6: 빈도 단어를 오늘의 단어에 넣기

**Files:**
- Modify:
  - `scripts/build-words.mjs`
  - `src/data/words.ts`
  - `src/db/repository.ts`
  - `src/pages/VillagePage.tsx`
- Create: `scripts/data/learn-ja.txt`, `scripts/data/learn-en.txt` (처음엔 빈 파일. 시작 위치가 정해진 뒤 500개씩 채운다)
- Test:
  - `src/data/words.test.ts`
  - `src/db/repository.test.ts`
  - `src/pages/VillagePage.test.tsx`

**Interfaces:**
- Produces:
  - `WordEntry`에 필드 추가:
    - `source: 'base' | 'freq'`
    - `rank: number | null` (base는 null)
  - 빈도 단어:
    - id: `ja-f00123` / `en-f00123` (5자리 rank)
    - theme: `'회화'`
    - searchQuery: text
    - 일본어 `kanji`는 base와 같은 규칙
  - `learn-<lang>.txt` 한 줄 형식: `rank|meaningKo`. 빌드는 freq TSV에서 text·reading을 가져온다.
  - `todaysWords(language, budget)`: 시그니처는 그대로 두고 안에서 `startRankOf(language)`를 읽는다.
    - 시작 위치 없음: 지금처럼 base 순서
    - 시작 위치 있음: rank ≥ 시작 위치인 freq(순위순) → 남은 base
  - `freqWordsLeft(language: Language): Promise<number | null>`: 시작 위치가 없으면 null, 있으면 남은 freq 수

- [ ] **Step 1: 실패하는 테스트 작성**
  - **words:**
    - 모든 freq 항목의 id는 `<lang>-f` + 5자리 rank다.
    - freq와 base의 text가 겹치지 않는다.
    - base 항목은 source `'base'`, rank `null`이다.
    - 지금은 learn 파일이 비어 있어 freq 검사는 Task 8 뒤에 의미가 생기고, 빌드 스크립트도 같은 규칙을 어기면 에러를 낸다.
  - **repository** (`vi.mock('../data/words')`로 base 2개, freq rank 5·12·30 고정):
    - 시작 위치 없음 → base 2개
    - `setStartRank('ja', 10)` → `[f12, f30, base1, base2]`
    - f12를 known으로 표시 → `freqWordsLeft('ja') === 1`
  - **VillagePage:** 시작 위치가 있고 `freqWordsLeft === 0`이면 `새 단어를 준비하고 있어요`가 보인다.

- [ ] **Step 2: 실행해 실패 확인**

  Run: `pnpm vitest run src/data/words.test.ts src/db/repository.test.ts src/pages/VillagePage.test.tsx`
  Expected: 새 테스트 FAIL

- [ ] **Step 3: 구현**
  - `build-words.mjs`가 freq TSV와 learn 파일을 읽어 `words-<lang>.json` 뒤에 freq 항목을 붙인다.
  - learn 파일의 rank가 TSV에 없으면 에러를 낸다.
  - `todaysWords`와 `freqWordsLeft`를 위 규칙대로 바꾼다.
  - 홈에 안내를 붙인다.

- [ ] **Step 4: 실행해 통과 확인**

  Run: 같은 명령
  Expected: PASS

### Task 7: 단어장에서 한꺼번에 '알아요'

**Files:**
- Modify: `src/pages/WordsPage.tsx`, `src/db/repository.ts`, `src/index.css`
- Test:
  - `src/pages/WordsPage.test.tsx` (새로)
  - `src/db/repository.test.ts`

**Interfaces:**
- Produces: `markWords(wordIds: string[], status: 'known' | 'skipped'): Promise<void>` (`bulkPut`)

- [ ] **Step 1: 실패하는 테스트 작성**
  - **repository:** `markWords(['ja-0001','ja-0002'],'known')` 뒤 두 단어 상태가 `known`이다.
  - **WordsPage:**
    - 위쪽 목록 전환 `기초 625`/`회화`가 있다. 회화에는 준비된 freq 단어가 순위순으로 보인다.
    - '만들 단어'에서 `여러 개 고르기` → 두 줄 체크 → `알아요로 표시 (2)` → 두 단어가 목록에서 사라지고 '아는 단어'에 보인다.
    - 고르기 모드에서는 줄을 눌러도 만들기 화면으로 가지 않는다.

- [ ] **Step 2: 실행해 실패 확인**

  Run: `pnpm vitest run src/pages/WordsPage.test.tsx src/db/repository.test.ts`
  Expected: 새 테스트 FAIL

- [ ] **Step 3: 구현**
  - **고르기 모드:**
    - 줄 앞에 체크 표시를 둔다.
    - 아래 고정 버튼은 `알아요로 표시 (n)`이고, 0개면 비활성이다.
    - 취소 버튼이 있다.
  - **'전부 고르기':** 지금 보이는 목록 전체를 고른다.

- [ ] **Step 4: 실행해 통과 확인**

  Run: 같은 명령
  Expected: PASS

- [ ] **Step 5: 전체 확인과 빌드**

  Run: `pnpm test && pnpm exec tsc -b && pnpm lint && pnpm build:web && pnpm android:apk`
  Expected: 모두 성공

### Task 8: 폰 확인과 첫 단어 준비 (운영)

- [ ] **Step 1: 설치와 확인 요청**
  - 하치와레 폰에 APK를 설치한다.
  - 사용자에게 다음을 확인해 달라고 한다.
    - 공부 화면 배치(출제·반응·손님 대체 모습)
    - 단어장 고르기
    - 어휘량 테스트
- [ ] **Step 2: 첫 500개 준비**
  - 사용자가 알려 준 시작 위치(하치와레, 우사기 각각)부터 빈도 단어 500개의 뜻을 `learn-<lang>.txt`에 쓴다.
  - `node scripts/build-words.mjs`로 다시 만들고, `pnpm test`가 통과하는지 확인한다.
- [ ] **Step 3: 반영**
  - APK는 다시 설치한다.
  - 웹은 사용자가 요청할 때 push한다.
