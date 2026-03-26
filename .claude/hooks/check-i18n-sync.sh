#!/bin/bash
# ko/en 로케일 파일 키 동기화 확인
# PostToolUse: Edit|Write — i18n 파일 수정 시 실행

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# i18n 파일 수정이 아니면 무시
if ! echo "$FILE_PATH" | grep -q "i18n/locales/"; then
  exit 0
fi

found_missing=0
output=""

for ko_file in src/i18n/locales/ko/*.json; do
  filename=$(basename "$ko_file")
  en_file="src/i18n/locales/en/$filename"

  if [ ! -f "$en_file" ]; then
    output+="[i18n] en/$filename 파일이 없습니다!\n"
    found_missing=1
    continue
  fi

  ko_keys=$(jq -r '[paths(scalars)] | map(join(".")) | sort[]' "$ko_file" 2>/dev/null)
  en_keys=$(jq -r '[paths(scalars)] | map(join(".")) | sort[]' "$en_file" 2>/dev/null)

  missing_in_en=$(comm -23 <(echo "$ko_keys") <(echo "$en_keys"))
  missing_in_ko=$(comm -13 <(echo "$ko_keys") <(echo "$en_keys"))

  if [ -n "$missing_in_en" ]; then
    output+="[i18n] en/$filename 에 누락된 키:\n$(echo "$missing_in_en" | head -10)\n"
    found_missing=1
  fi
  if [ -n "$missing_in_ko" ]; then
    output+="[i18n] ko/$filename 에 누락된 키:\n$(echo "$missing_in_ko" | head -10)\n"
    found_missing=1
  fi
done

if [ $found_missing -ne 0 ]; then
  msg=$(echo -e "$output" | sed 's/"/\\"/g' | tr '\n' ' ')
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"$msg\"}}"
fi
