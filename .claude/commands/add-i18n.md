# i18n Key Addition Agent

다국어 번역 키를 ko/en JSON 파일 양쪽에 동시 추가한다.

## 역할
- 번역 키를 한국어/영어 JSON 파일에 동시 추가
- 기존 네임스페이스 구조에 맞게 배치
- 누락된 키 감지 및 보완
- i18next interpolation 문법 지원

## i18n 구조

```
src/i18n/locales/
├── ko/
│   ├── common.json        # 공통 (버튼, 라벨, 상태)
│   ├── dashboard.json     # 대시보드
│   ├── notes.json         # 연구노트
│   ├── inventory.json     # 시약/장비
│   ├── scheduler.json     # 예약
│   ├── search.json        # 검색
│   ├── settings.json      # 설정
│   └── ...
└── en/
    └── (동일 구조)
```

## JSON 패턴

```json
{
  "sectionName": {
    "label": "표시 텍스트",
    "labelTooltip": "호버 설명",
    "labelDescription": "부가 설명",
    "placeholder": "입력 힌트"
  },
  "interpolated": "{{count}}개의 항목",
  "nested": {
    "deep": {
      "key": "값"
    }
  }
}
```

### 네이밍 컨벤션
- 라벨: `sectionName` (camelCase)
- 툴팁: `{field}Tooltip`
- 설명: `{field}Description`
- 플레이스홀더: `{field}Placeholder`
- 에러 메시지: `errors.{errorType}`
- 보간 변수: `{{variableName}}` (의미있는 이름)

## 실행

$ARGUMENTS 를 다음 형식으로 받는다:

### 형식 1: 직접 지정
```
<네임스페이스> <키경로> <한국어> <영어>
```
예시: `notes status.draft 초안 Draft`

### 형식 2: 여러 키 한번에
```
dashboard stats.experiments 실험 Experiments
dashboard stats.experimentsTooltip 진행 중인 실험 수 Number of ongoing experiments
```

### 형식 3: 자연어
```
대시보드에 "최근 활동" 섹션 텍스트 추가해줘 (recentActivity)
```

## 절차

1. 대상 네임스페이스의 ko/en JSON 파일 읽기
2. 기존 구조 파악 (정렬 순서, 들여쓰기, 중첩 깊이)
3. 적절한 위치에 키 삽입 (기존 섹션이 있으면 그 안에, 없으면 새 섹션)
4. ko/en 양쪽 동시 수정
5. 키 누락 검증: 한쪽에만 있는 키가 없는지 확인

## 체크리스트
- [ ] ko, en 양쪽 파일 모두 수정
- [ ] 키 경로가 양쪽에서 동일
- [ ] 기존 JSON 구조/정렬과 일관성 유지
- [ ] interpolation 변수명이 양쪽에서 동일 (`{{count}}` 등)
- [ ] 하드코딩된 문자열 없이 t() 함수로 참조 가능
