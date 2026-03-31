# ELN-Convenient 사용자 매뉴얼

## 목차

1. [설치 방법](#설치-방법)
2. [실행 방법](#실행-방법)
3. [사용 가이드](#사용-가이드)
4. [주요 설정](#주요-설정)
5. [FAQ](#faq)

---

## 설치 방법

### 사전 요구사항

| 항목 | 버전 | 비고 |
|------|------|------|
| Docker & Docker Compose | 최신 | 14개 서비스 컨테이너 실행용 |
| Node.js | LTS | 프론트엔드 개발 서버 실행용 |
| Git | 최신 | |

### 프로젝트 클론

```bash
git clone <repository-url>
cd eln-convenient
```

### 환경 변수 설정 (필수)

`.env.example` 파일을 복사하여 `.env` 파일을 생성합니다:

```bash
cp .env.example .env
```

> **중요**: `.env` 파일이 없으면 서비스가 정상적으로 시작되지 않습니다. 반드시 설정 후 실행하세요.

---

## 실행 방법

### 1단계: 백엔드 서비스 실행 (Docker Compose)

```bash
cd services
docker compose up -d --build
```

14개 서비스가 모두 정상 기동되었는지 확인합니다:

```bash
docker compose ps
```

### 2단계: 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

프론트엔드 개발 서버는 **포트 5173**에서 실행됩니다.

### 실행 확인

| 서비스 | URL | 설명 |
|--------|-----|------|
| 메인 프론트엔드 | `http://localhost:5173` | 메인 웹 애플리케이션 |
| 인벤토리 서비스 | `http://localhost:3000` | 인벤토리 관리 |

---

## 사용 가이드

### 접속

- **메인 애플리케이션**: 브라우저에서 `http://localhost:5173`으로 접속
- **인벤토리 관리**: 브라우저에서 `http://localhost:3000`으로 접속

### 시드 계정

초기 시드 계정이 마이그레이션을 통해 자동 생성됩니다. 로그인 페이지에서 시드 계정으로 접속하세요.

### 주요 기능

1. **인벤토리 관리**: 재고 입출고, 재고 현황 조회
2. **검색**: OpenSearch 기반 통합 검색
3. **파일 관리**: MinIO 기반 파일 업로드/다운로드
4. **다중 서비스 연동**: 마이크로서비스 아키텍처 기반 통합 운영

---

## 주요 설정

### .env

`.env.example`을 참고하여 다음 항목을 설정합니다:

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=eln
POSTGRES_USER=eln_user
POSTGRES_PASSWORD=eln_password

# JWT
JWT_SECRET=your-jwt-secret-key

# 서비스 간 통신
INTERNAL_SECRET=your-internal-secret-key

# MinIO (파일 스토리지)
MINIO_ROOT_USER=minio_admin
MINIO_ROOT_PASSWORD=minio_password
MINIO_ENDPOINT=http://localhost:9000
MINIO_BUCKET=eln-bucket
```

### 주요 설정 항목 설명

| 항목 | 설명 |
|------|------|
| `POSTGRES_*` | PostgreSQL 데이터베이스 접속 정보 |
| `JWT_SECRET` | JWT 토큰 서명에 사용되는 시크릿 키 |
| `INTERNAL_SECRET` | 마이크로서비스 간 내부 통신 인증 키 |
| `MINIO_*` | MinIO 오브젝트 스토리지 접속 정보 |

---

## FAQ

### Q: 서비스 시작 순서가 중요한가요?

**A:** 네, 일부 서비스는 의존성이 있어 순서가 중요합니다. Docker Compose의 `depends_on` 설정으로 기본적인 순서는 관리되지만, 데이터베이스와 메시지 큐 등 인프라 서비스가 완전히 시작된 후에 애플리케이션 서비스가 기동되어야 합니다.

서비스가 정상 시작되지 않으면 다음을 시도하세요:

```bash
# 모든 서비스 중지 후 재시작
docker compose down
docker compose up -d --build

# 특정 서비스 로그 확인
docker compose logs -f <서비스명>
```

### Q: Prisma 마이그레이션은 어떻게 실행하나요?

**A:** Prisma를 사용하는 서비스에서 다음 명령어로 마이그레이션을 실행합니다:

```bash
# 마이그레이션 생성
npx prisma migrate dev --name <마이그레이션_이름>

# 마이그레이션 적용 (프로덕션)
npx prisma migrate deploy

# Prisma 클라이언트 재생성
npx prisma generate
```

마이그레이션 실패 시 데이터베이스 연결 정보(`.env`의 `POSTGRES_*`)가 올바른지 확인하세요.

### Q: OpenSearch에서 한글 검색이 되지 않습니다.

**A:** OpenSearch에 **nori 플러그인**(한국어 형태소 분석기)이 설치되어 있는지 확인하세요.

Docker 환경에서 nori 플러그인 설치:

```bash
# OpenSearch 컨테이너 진입
docker compose exec opensearch bash

# nori 플러그인 설치
bin/opensearch-plugin install analysis-nori

# 컨테이너 재시작
exit
docker compose restart opensearch
```

플러그인 설치 후 인덱스를 재생성해야 한글 형태소 분석이 적용됩니다.
