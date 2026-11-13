# 단어 목록 출처

## 기초 625 (`base625.json`, `words.txt`)

- Gabriel Wyner, Fluent Forever의 공개 625 단어 목록(주제별). 일본어 대응어·읽기·우리말 뜻은 이 저장소에서 직접 골랐다.

## 회화 빈도 (`freq-ja.tsv`, `freq-en.tsv`)

자막에서 단어가 나오는 횟수로 줄 세운 상위 10,000개다. **자막 문장은 넣지 않았다.** 단어, 읽기, 순위, 횟수만 있다.

- **일본어**
  - 원본: OPUS OpenSubtitles v2018 일본어 단일어 텍스트 (P. Lison and J. Tiedemann, 2016, *OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV Subtitles*; www.opensubtitles.org)
  - 형태소 분석: fugashi + unidic-lite (UniDic, BSD 라이선스)
  - 만들기: `scripts/frequency/build_ja.py`
- **영어**
  - 원본: Hermit Dave, FrequencyWords `content/2018/en/en_50k.txt` (OpenSubtitles 2018 기반, CC BY-SA 4.0)
  - 표제어: spaCy `en_core_web_sm` (MIT)
  - 발음 기호: CMU Pronouncing Dictionary (BSD 라이선스)를 IPA로 바꿨다.
  - 만들기: `scripts/frequency/build_en.py`

순위가 곧 단어 ID(`ja-f00123`)라서 두 TSV는 다시 만들지 않는다. 스크립트도 기존 파일이 있으면 멈춘다.

## 회화 빈도 우리말 뜻 (`learn-ja.txt`, `learn-en.txt`)

- 1~5,000번째 단어의 뜻은 이 저장소에서 직접 붙였다. 자막 효과음 태그([chuckles] 같은 것), 인명, 형태소 분석이 잘라 낸 조각, 같은 말의 다른 표기는 `#`로 막고 이유를 적어 앱에 넣지 않는다.
- 분석이 고른 읽기가 틀린 단어(read → rɛd, 明日 → あす 등)는 셋째 칸에 고친 읽기를 적는다.

## 빈칸 문장 (`sentences-ja.txt`, `sentences-en.txt`)

단어마다 후보 문장을 뽑고, 그중 뜻이 맞고 일상 회화에 가까운 한 문장을 골라 우리말 번역을 붙였다. 개인 학습용으로만 쓴다.

- **일본어**
  - Kaishi 1.5k (donkuri/Kaishi, Anki 덱): 학습자용 문장과 원어민 음성. 뜻이 맞으면 먼저 쓴다.
  - ImmersionKit (immersionkit.com): 애니·드라마 대사와 장면 음성. Kaishi에 없거나 뜻이 다른 단어에 쓴다. 후보는 fugashi로 그 단어가 실제로 쓰인 문장만 남겼다.
- **영어**
  - DailyDialog (Li et al., 2017, *DailyDialog: A Manually Labelled Multi-turn Dialogue Dataset*): 일상 대화. 먼저 쓴다.
  - Tatoeba (tatoeba.org): 원어민 음성이 있는 문장만. DailyDialog에 맞는 문장이 없을 때 쓴다.
- 맞는 후보가 없으면 직접 썼다(`self`). 비속어·감탄사·기호는 `SKIP`으로 뺐다.
- 원문 데이터와 후보를 뽑은 스크립트는 저장소에 넣지 않았다. Kaishi·ImmersionKit·Tatoeba 문장은 음성과 맞아야 해서 고치지 않았고, DailyDialog 문장은 띄어쓰기와 대소문자만 고쳤다.
