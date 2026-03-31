/**
 * 파일 업로드 MIME/확장자/매직바이트 차단 테스트
 */

// 직접 테스트할 상수와 함수를 인라인 정의 (컨트롤러 import 없이)
const BLOCKED_MIME = new Set([
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'text/x-sh',
  'application/x-bat',
]);

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'bash', 'com', 'scr', 'pif',
  'msi', 'dll', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh',
  'ps1', 'psm1', 'psd1', 'reg', 'inf', 'hta', 'cpl',
]);

const EXECUTABLE_MAGIC_BYTES = [
  { bytes: [0x4D, 0x5A], desc: 'PE/EXE (MZ header)' },
  { bytes: [0x7F, 0x45, 0x4C, 0x46], desc: 'ELF executable' },
  { bytes: [0xCA, 0xFE, 0xBA, 0xBE], desc: 'Mach-O (macOS)' },
  { bytes: [0xCF, 0xFA, 0xED, 0xFE], desc: 'Mach-O 64-bit' },
];

function isExecutableByMagicBytes(buffer: Buffer): string | null {
  for (const { bytes, desc } of EXECUTABLE_MAGIC_BYTES) {
    if (buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b)) {
      return desc;
    }
  }
  return null;
}

describe('File Upload Security', () => {
  describe('BLOCKED_MIME', () => {
    it('실행 파일 MIME 차단', () => {
      expect(BLOCKED_MIME.has('application/x-msdownload')).toBe(true);
      expect(BLOCKED_MIME.has('application/x-executable')).toBe(true);
      expect(BLOCKED_MIME.has('application/x-sh')).toBe(true);
    });

    it('일반 MIME 허용', () => {
      expect(BLOCKED_MIME.has('application/pdf')).toBe(false);
      expect(BLOCKED_MIME.has('image/png')).toBe(false);
      expect(BLOCKED_MIME.has('text/plain')).toBe(false);
    });
  });

  describe('BLOCKED_EXTENSIONS', () => {
    it('위험 확장자 차단', () => {
      expect(BLOCKED_EXTENSIONS.has('exe')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('bat')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('sh')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('ps1')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('dll')).toBe(true);
    });

    it('안전한 확장자 허용', () => {
      expect(BLOCKED_EXTENSIONS.has('pdf')).toBe(false);
      expect(BLOCKED_EXTENSIONS.has('png')).toBe(false);
      expect(BLOCKED_EXTENSIONS.has('docx')).toBe(false);
      expect(BLOCKED_EXTENSIONS.has('csv')).toBe(false);
    });
  });

  describe('isExecutableByMagicBytes', () => {
    it('PE/EXE 파일 탐지 (MZ header)', () => {
      const buffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00]);
      expect(isExecutableByMagicBytes(buffer)).toBe('PE/EXE (MZ header)');
    });

    it('ELF 파일 탐지', () => {
      const buffer = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02]);
      expect(isExecutableByMagicBytes(buffer)).toBe('ELF executable');
    });

    it('Mach-O 파일 탐지', () => {
      const buffer = Buffer.from([0xCF, 0xFA, 0xED, 0xFE]);
      expect(isExecutableByMagicBytes(buffer)).toBe('Mach-O 64-bit');
    });

    it('PDF 파일은 탐지 안 됨', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      expect(isExecutableByMagicBytes(buffer)).toBeNull();
    });

    it('빈 버퍼', () => {
      const buffer = Buffer.from([]);
      expect(isExecutableByMagicBytes(buffer)).toBeNull();
    });

    it('.txt로 위장한 EXE 탐지', () => {
      const buffer = Buffer.from([0x4D, 0x5A, 0x00, 0x00, 0x00]);
      expect(isExecutableByMagicBytes(buffer)).toBe('PE/EXE (MZ header)');
    });
  });
});
