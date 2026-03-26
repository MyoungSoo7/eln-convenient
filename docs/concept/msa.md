# MSA 프로젝트 유용한 도구 모음

## 개발 생산성

| 도구 | 용도 | 왜 필요한가 |
|------|------|------------|
| **Portainer** | Docker 컨테이너 GUI 관리 | 10개 서비스 로그/상태를 웹에서 한눈에 확인 |
| **Lazydocker** | 터미널 Docker 대시보드 | CLI에서 컨테이너 로그/리소스 실시간 모니터링 |
| **ctop** | 컨테이너 top | 서비스별 CPU/메모리 사용량 실시간 확인 |

## 로그 & 디버깅

| 도구 | 용도 | 왜 필요한가 |
|------|------|------------|
| **Dozzle** | 실시간 로그 뷰어 (웹) | 여러 서비스 로그를 브라우저에서 필터링/검색 |
| **stern** | 멀티 컨테이너 로그 tail | `stern labnote` → 모든 서비스 로그를 색상으로 구분 |

## API & 통신

| 도구 | 용도 | 왜 필요한가 |
|------|------|------------|
| **Bruno / Hoppscotch** | API 테스트 | Gateway 통한 API 테스트 + 팀 공유 (git 저장 가능) |
| **OpenTelemetry + Jaeger** | 분산 트레이싱 | 서비스 간 호출 흐름 추적 (auth→eln→signature 같은 체인) |

## 추천 우선순위

### 1. Dozzle — 실시간 로그 뷰어

설정 0, docker-compose에 추가만 하면 끝.

```yaml
dozzle:
  image: amir20/dozzle:latest
  ports:
    - "9999:8080"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
```

- 접속: http://localhost:9999
- 모든 컨테이너 로그를 브라우저에서 실시간 확인
- 서비스별 필터링, 검색, 멀티 컨테이너 동시 보기 가능

### 2. Lazydocker — 터미널 Docker 대시보드

```bash
choco install lazydocker   # Windows
lazydocker                 # 실행
```

- 컨테이너 상태, 로그, 리소스 사용량을 터미널에서 한눈에
- 컨테이너 재시작, 삭제 등 빠른 조작 가능

### 3. Jaeger — 분산 트레이싱

```yaml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"   # UI
    - "4318:4318"     # OTLP HTTP
```

- 각 서비스에 OpenTelemetry SDK 추가 필요
- auth→eln→signature 같은 서비스 간 호출 체인을 시각화
- 병목 구간, 에러 발생 지점 추적에 유용

## 자동 재빌드 스크립트

`./rebuild.sh` 참고 — git diff 기반 변경 서비스 자동 감지 후 재빌드
