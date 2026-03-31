import { AppError, buildErrorResponse, buildFastifyErrorHandler } from '../errors';

describe('AppError', () => {
  it('기본 에러 생성', () => {
    const err = new AppError(404, '찾을 수 없습니다');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('찾을 수 없습니다');
    expect(err.code).toBe('ERR_404');
    expect(err.name).toBe('AppError');
  });

  it('커스텀 코드와 상세 정보', () => {
    const err = new AppError(400, '검증 실패', 'VALIDATION_ERROR', ['field1 필수']);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(['field1 필수']);
  });
});

describe('buildErrorResponse', () => {
  it('기본 응답 구조', () => {
    const resp = buildErrorResponse(404, '찾을 수 없습니다');
    expect(resp).toEqual({ ok: false, error: '찾을 수 없습니다', code: 'ERR_404' });
  });

  it('커스텀 코드와 상세 정보 포함', () => {
    const resp = buildErrorResponse(400, '에러', 'CUSTOM', ['detail1']);
    expect(resp.code).toBe('CUSTOM');
    expect(resp.details).toEqual(['detail1']);
  });

  it('빈 details는 포함하지 않음', () => {
    const resp = buildErrorResponse(500, '에러', undefined, []);
    expect(resp.details).toBeUndefined();
  });
});

describe('buildFastifyErrorHandler', () => {
  it('AppError를 올바른 상태 코드로 처리', () => {
    const handler = buildFastifyErrorHandler();
    const reply = { code: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    const error = new AppError(403, '접근 거부', 'FORBIDDEN');

    handler(error, {} as any, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: '접근 거부', code: 'FORBIDDEN' })
    );
  });

  it('validation 에러를 400으로 처리', () => {
    const handler = buildFastifyErrorHandler();
    const reply = { code: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    const error = Object.assign(new Error('val'), { validation: [{ message: 'field required' }] });

    handler(error as any, {} as any, reply);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ERR_VALIDATION' })
    );
  });
});
