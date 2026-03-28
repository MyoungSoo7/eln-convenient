# 인증/인가 흐름 시퀀스 다이어그램

## 1. 로그인 흐름

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (React)
    participant GW as API Gateway :8000
    participant Auth as Auth Service :8001

    User->>FE: 로그인 페이지 접근
    FE->>GW: POST /api/auth/login<br/>{username, password}
    GW->>Auth: 프록시 전달
    Auth->>Auth: 비밀번호 검증 (bcrypt)

    alt 인증 성공
        Auth->>Auth: JWT 생성 (accessToken + refreshToken)
        Auth-->>GW: 200 {ok: true, data: {accessToken, refreshToken, user}}
        GW-->>FE: 응답 전달
        FE->>FE: localStorage에 토큰 저장
        FE-->>User: 대시보드로 리디렉트
    else 인증 실패
        Auth-->>GW: 401 {ok: false, error: "Invalid credentials"}
        GW-->>FE: 응답 전달
        FE-->>User: 에러 메시지 표시
    end
```

## 2. API 요청 인가 흐름

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (React)
    participant GW as API Gateway :8000
    participant Svc as 내부 서비스

    User->>FE: 기능 사용 (예: 노트 목록)
    FE->>FE: apiClient - Authorization 헤더 주입
    FE->>GW: GET /api/notes<br/>Authorization: Bearer {jwt}

    GW->>GW: JWT 검증 (jose JWKS / 로컬 시크릿)

    alt JWT 유효
        GW->>GW: 헤더 주입
        Note over GW: x-user-id<br/>x-user-role<br/>x-user-permissions<br/>x-user-org-id<br/>x-user-team-ids
        GW->>Svc: 프록시 + 주입된 헤더
        Svc->>Svc: requireAuth 미들웨어
        Svc->>Svc: requirePermission(NOTE_READ)
        Svc->>Svc: getOrgId() → orgId 스코프 필터
        Svc-->>GW: 200 {ok: true, data: [...]}
        GW-->>FE: 응답 전달
        FE-->>User: 데이터 표시
    else JWT 만료
        GW-->>FE: 401 Unauthorized
        FE->>GW: POST /api/auth/refresh<br/>{refreshToken}
        GW->>Auth: 프록시 전달
        Auth-->>GW: 200 {newAccessToken}
        GW-->>FE: 새 토큰
        FE->>FE: 토큰 갱신 후 원래 요청 재시도
    else JWT 무효 / 리프레시 실패
        GW-->>FE: 401
        FE->>FE: 토큰 삭제
        FE-->>User: /login으로 리디렉트
    end
```

## 3. 서비스 간 내부 인증

```mermaid
sequenceDiagram
    participant SvcA as 서비스 A (예: signature-audit)
    participant SvcB as 서비스 B (예: auth-service)

    SvcA->>SvcB: POST /api/auth/internal/verify-password<br/>Headers: x-internal-secret

    SvcB->>SvcB: requireInternalSecretFastify 검증

    alt 시크릿 일치
        SvcB->>SvcB: 비즈니스 로직 처리
        SvcB-->>SvcA: 200 {ok: true, data: {verified: true}}
    else 시크릿 불일치
        SvcB-->>SvcA: 403 Forbidden
    end
```

## 핵심 포인트

| 항목 | 설명 |
|------|------|
| **JWT 검증 위치** | API Gateway에서 1회만 검증, 내부 서비스는 주입된 헤더 신뢰 |
| **토큰 갱신 조건** | accessToken 만료 5분 전 또는 401 수신 시 |
| **동시 갱신 방지** | apiClient에서 단일 Promise로 중복 리프레시 차단 |
| **서비스 간 인증** | `x-internal-secret` 환경변수 일치 확인 |
| **멀티테넌시** | 모든 쿼리에 `orgId` 자동 필터 (누락 = 보안 위반) |
