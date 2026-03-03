-- ============================================================
-- ELN 플랫폼 데이터베이스 스키마 (PostgreSQL)
-- 연구노트 상태 관리 및 관리자 잠금 해제 기능 포함
-- 생성일: 2026-03-03
-- ============================================================

-- ── 확장 기능 ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. 사용자 및 역할
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'researcher', 'reviewer', 'viewer');

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    role        user_role NOT NULL DEFAULT 'researcher',
    team        VARCHAR(100),
    org         VARCHAR(200),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users IS '시스템 사용자 테이블';
COMMENT ON COLUMN users.role IS '사용자 역할: admin(관리자), researcher(연구원), reviewer(검토자), viewer(열람자)';

-- ============================================================
-- 2. 연구노트 (notes)
-- ============================================================

CREATE TYPE note_status AS ENUM ('draft', 'in_progress', 'signed', 'locked');

CREATE TABLE notes (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title        VARCHAR(500) NOT NULL,
    content      TEXT NOT NULL DEFAULT '',
    status       note_status NOT NULL DEFAULT 'draft',
    author_id    UUID NOT NULL REFERENCES users(id),
    template_id  UUID,
    project      VARCHAR(200),
    tags         TEXT[] DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ  -- 소프트 삭제
);

CREATE INDEX idx_notes_status    ON notes(status);
CREATE INDEX idx_notes_author    ON notes(author_id);
CREATE INDEX idx_notes_project   ON notes(project);
CREATE INDEX idx_notes_tags      ON notes USING GIN(tags);

COMMENT ON TABLE  notes IS '연구노트 메인 테이블';
COMMENT ON COLUMN notes.status IS '노트 상태: draft(초안), in_progress(진행 중), signed(서명 완료), locked(잠김)';

-- ============================================================
-- 3. 노트 상태 전환 이력
-- ============================================================

CREATE TABLE note_status_history (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id       UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    from_status   note_status NOT NULL,
    to_status     note_status NOT NULL,
    changed_by    UUID NOT NULL REFERENCES users(id),
    reason        TEXT,
    is_admin_action BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_history_note ON note_status_history(note_id);

COMMENT ON TABLE  note_status_history IS '노트 상태 전환 이력 (감사 추적용)';
COMMENT ON COLUMN note_status_history.is_admin_action IS '관리자 잠금 해제 여부';

-- ============================================================
-- 4. 노트 리비전 (버전 관리)
-- ============================================================

CREATE TABLE note_revisions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id        UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    revision       INTEGER NOT NULL,
    content        TEXT NOT NULL,
    changed_by     UUID NOT NULL REFERENCES users(id),
    change_summary VARCHAR(500),
    content_hash   VARCHAR(128),  -- SHA-256 무결성 해시
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(note_id, revision)
);

CREATE INDEX idx_revisions_note ON note_revisions(note_id);

COMMENT ON TABLE note_revisions IS '노트 리비전 (변경 이력 및 내용 버전 관리)';

-- ============================================================
-- 5. 노트 섹션
-- ============================================================

CREATE TABLE note_sections (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id    UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    type       VARCHAR(50) NOT NULL,
    title      VARCHAR(200) NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sections_note ON note_sections(note_id);

COMMENT ON TABLE note_sections IS '노트 본문 섹션 (목적, 재료, 방법, 결과, 고찰 등)';

-- ============================================================
-- 6. 노트 링크 (교차 참조)
-- ============================================================

CREATE TYPE link_target_type AS ENUM ('inventory', 'equipment', 'protocol', 'note');

CREATE TABLE note_links (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id     UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_type link_target_type NOT NULL,
    target_id   UUID NOT NULL,
    label       VARCHAR(200),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_links_note ON note_links(note_id);

COMMENT ON TABLE note_links IS '노트 간 교차 참조 링크 (인벤토리, 장비, 프로토콜, 노트)';

-- ============================================================
-- 7. 첨부파일
-- ============================================================

CREATE TABLE note_attachments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id     UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    file_id     UUID NOT NULL,  -- file-service 참조
    filename    VARCHAR(500) NOT NULL,
    mime_type   VARCHAR(100),
    size_bytes  BIGINT,
    checksum    VARCHAR(128),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_note ON note_attachments(note_id);

COMMENT ON TABLE note_attachments IS '노트 첨부파일 메타데이터';

-- ============================================================
-- 8. 템플릿
-- ============================================================

CREATE TABLE templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    content     TEXT NOT NULL DEFAULT '',
    category    VARCHAR(100) NOT NULL,
    tags        TEXT[] DEFAULT '{}',
    created_by  UUID NOT NULL REFERENCES users(id),
    is_public   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE templates IS '연구노트 템플릿';

-- ============================================================
-- 9. 전자서명
-- ============================================================

CREATE TYPE signature_status AS ENUM ('valid', 'revoked', 'expired');

CREATE TABLE signatures (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id         UUID NOT NULL REFERENCES notes(id),
    signer_id       UUID NOT NULL REFERENCES users(id),
    signature_hash  VARCHAR(256) NOT NULL,
    content_hash    VARCHAR(256) NOT NULL,  -- 서명 시점의 노트 내용 해시
    status          signature_status NOT NULL DEFAULT 'valid',
    signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_signatures_note ON signatures(note_id);

COMMENT ON TABLE  signatures IS '전자서명 기록';
COMMENT ON COLUMN signatures.content_hash IS '서명 시점 노트 내용의 SHA-256 해시 (위변조 검증용)';

-- ============================================================
-- 10. 감사로그 (Audit Trail)
-- ============================================================

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,   -- 'note', 'inventory', 'booking', 'signature' 등
    entity_id   UUID NOT NULL,
    action      VARCHAR(100) NOT NULL,
    actor_id    UUID NOT NULL REFERENCES users(id),
    details     JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor   ON audit_logs(actor_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

COMMENT ON TABLE audit_logs IS '시스템 전체 감사로그 (불변 이력)';

-- ============================================================
-- 11. 상태 전환 제약 함수 (비즈니스 룰 적용)
-- ============================================================

CREATE OR REPLACE FUNCTION check_note_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- 허용 전환: draft↔in_progress, in_progress→locked
    -- locked→draft는 admin_unlock 전용 (is_admin_action=true 체크)
    IF OLD.status = 'draft' AND NEW.status NOT IN ('in_progress') THEN
        RAISE EXCEPTION '초안에서는 "진행 중"으로만 전환할 수 있습니다.';
    END IF;

    IF OLD.status = 'in_progress' AND NEW.status NOT IN ('draft', 'locked') THEN
        RAISE EXCEPTION '진행 중에서는 "초안" 또는 "잠김"으로만 전환할 수 있습니다.';
    END IF;

    IF OLD.status = 'signed' AND OLD.status != NEW.status THEN
        RAISE EXCEPTION '서명 완료된 노트의 상태는 변경할 수 없습니다.';
    END IF;

    IF OLD.status = 'locked' AND NEW.status != 'draft' THEN
        RAISE EXCEPTION '잠긴 노트는 "초안"으로만 해제할 수 있습니다.';
    END IF;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_note_status_transition
    BEFORE UPDATE OF status ON notes
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION check_note_status_transition();

COMMENT ON FUNCTION check_note_status_transition IS '노트 상태 전환 비즈니스 룰 검증 트리거 함수';
