# 제초 검정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전체 어휘량 기준 급수와 주관식 검정 시험을 집 화면에서 볼 수 있게 한다.

**Architecture:** 급수 규칙·채점은 순수 함수(`src/domain/exam.ts`), 기록·카드 당기기는 저장소(`src/db/repository.ts`), 화면은 새 `/exam` 페이지와 집 화면 버튼. 자격증 그림은 원본에서 숫자만 바꾼 복사본을 급수·사람별로 넣는다.

**Tech Stack:** React 19, Dexie, Vitest(jsdom, fake-indexeddb), Pillow(그림 준비).

**Spec:** `docs/superpowers/specs/2026-11-10-license-exam-design.md`

## Global Constraints

- 급수표: 4급 어휘 1,000·익힌 100·10문제·8합격 / 3급 2,000·300·15·12 / 2급 3,000·600·20·16 / 1급 5,000·1,000·30·24.
- 익힌 단어: 그 언어에서 그 단어의 모든 카드 `fsrs.scheduled_days >= 21`.
- 문구는 친근한 반말. 실명 금지. 컴포넌트·훅은 함수 선언문, 나머지는 화살표 함수.
- 그림은 사용자가 준 것만, 원본은 고치지 않는다.

## Review Focus

- 오늘 떨어진 급수를 같은 날 다시 볼 수 있는지(안 돼야 한다).
- 일본어 가타카나로 답했을 때·영어 대문자/문장부호가 섞였을 때 채점.
- 어휘량 테스트를 다시 본 뒤 익힌 단어를 두 번 세는지.
- 시험 중 나갔을 때 기록이 남는지(안 남아야 한다).
- 그림 없는 단어 문제에서 뜻이 보이는지.

---

### Task 1: 급수 규칙과 채점 (`src/domain/exam.ts`)

**Produces:**
- `GRADES: { grade: 1|2|3|4; vocab: number; learned: number; questions: number; pass: number }[]`
- `learnedWordIds(cards: StudyCard[]): string[]`
- `totalVocab(lastTest: VocabTestResult | null, cards: StudyCard[]): number` — 추정치 + 테스트 뒤 만든 카드의 익힌 단어
- `currentGrade(results: ExamResult[]): number` (합격 없으면 5)
- `examStatus({ grade, vocab, learned, results, now })` → `{ kind: 'ready'; grade } | { kind: 'retry-tomorrow'; grade } | { kind: 'locked'; grade; vocabLeft; learnedLeft } | { kind: 'top' }`
- `pickQuestions(words: WordEntry[], count: number, random)` — 순위 뒤쪽 2배에서 무작위(기초 단어는 쉬운 쪽)
- `checkAnswer(word: WordEntry, input: string): 'correct' | 'almost' | 'wrong'`
- `ExamResult = { takenAt: string; grade: number; correct: number; total: number; passed: boolean }`

- [ ] 테스트 먼저(`src/domain/exam.test.ts`): 급수표 값, 익힌 단어 판정(카드 하나라도 21일 미만이면 아님), 어휘량 이중 계산 없음, 가장 높은 급수 바로 보기, 오늘 떨어지면 내일, 남은 양, 1급이면 top, 어려운 단어 우선, 일본어 한자/히라가나/가타카나 정답, 영어 대소문자·문장부호·편집 거리 1(4글자 이상만) → 실패 확인 → 구현 → 통과.

### Task 2: 기록과 카드 당기기 (`src/db/repository.ts`, `src/backup/archive.ts`)

**Produces:** `examResults(language)`, `saveExamResult(language, result)`, `postponeToTomorrow(wordIds, now)`(카드 `fsrs.due`만 다음 날 0시로), `examProgress(language)`(급수·어휘량·익힌 단어·상태 한 번에). 백업 profile 키에 `exams:` 추가.

- [ ] 테스트 먼저(repository·archive 테스트에 추가) → 구현 → 통과.

### Task 3: 시험 화면 (`src/pages/ExamPage.tsx`, 라우트 `/exam`)

- 시작: 시작 그림(`exam-intro.webp`), "제초 N급 검정", 문제 수·합격 기준, "시작하기".
- 문제: 그림(없으면 뜻), 입력칸(자동 포커스), "확인" → 맞음/거의 맞았어/틀림 + 정답(일본어는 표기·읽기) → "다음".
- 결과: 합격이면 급수 자격증 그림(`license-<hachiware|usagi>-<급>.webp`) + 자랑 영상 + "합격!", 불합격이면 토벌 실패 + "괜찮아, 내일 다시 보자" + 틀린 단어. 틀린 단어는 `postponeToTomorrow`.
- [ ] 테스트 먼저(`src/pages/ExamPage.test.tsx`): 정답 입력 흐름, 합격 기록·자격증 그림, 불합격 기록·틀린 단어 당김, 중간에 나가면 기록 없음 → 구현 → 통과.

### Task 4: 집 화면과 책장

- 집: 제목 아래 "제초 N급", 맨 아래 시험 버튼(ready면 강조, 아니면 흐리게 + 남은 것 한 줄, retry면 "내일 다시 볼 수 있어").
- 책장 범위: 2급 2,001~3,000, 1급 3,001~10,000.
- [ ] 테스트 먼저(VillagePage·books 테스트) → 구현 → 통과. 전체 테스트·tsc·oxlint.

### Task 5: 그림과 마무리

- `scripts`에 자격증 숫자 바꾸기 스크립트, `src/characters/images/`에 `exam-intro.webp`, `license-*.webp`(10장), `usagi-license-brag.mp4`.
- 설계 문서(`2026-11-05-wordbook-design.md`) 급수 부분 갱신. 보통 빌드(.env.android.local 비움)로 폰 설치.
